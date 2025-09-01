async function activeTab() 
{
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || null;
}
function isRestricted(u) 
{
    try 
    {
        const x = new URL(u);
        if (!['http:', 'https:'].includes(x.protocol)) 
            return true;
        if (x.hostname.endsWith('chromewebstore.google.com')) 
            return true;
        return false;
    } 
    catch 
    { 
        return true; 
    }
}
async function pingOrInject(tabId) 
{
    if (!tabId) return false;
    try 
    {
        await chrome.tabs.sendMessage(tabId, { type: '__ping__' });
        return true;
    } 
    catch 
    {
        try 
        {
            await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
            await chrome.tabs.sendMessage(tabId, { type: '__ping__' });
            return true;
        } 
        catch 
        {
            return false;
        }
    }
}
async function send(tabId, msg) 
{
    try { await chrome.tabs.sendMessage(tabId, msg); return true; }
    catch { return false; }
}
chrome.runtime.onInstalled.addListener
(
    async () => 
    {
        try 
        {
            const regs = await chrome.scripting.getRegisteredContentScripts();
            const exists = regs?.some(r => r.id === 'imageScout');
            if (exists) 
                await chrome.scripting.unregisterContentScripts({ ids: ['imageScout'] });
        } 
        catch 
        {}
        await chrome.scripting.registerContentScripts
        (
            [
                {
                    id: 'imageScout',
                    matches: ['http://*/*', 'https://*/*'],
                    excludeMatches: ['*://chromewebstore.google.com/*'],
                    js: ['content.js'],
                    runAt: 'document_idle',
                    persistAcrossSessions: true
                }
            ]
        );
    }
);
chrome.action.onClicked.addListener
(
    async (tab) => 
    {
        if (!tab?.id || !tab.url || isRestricted(tab.url)) 
            return;
        await chrome.storage.session.set
        (
            {
                imageScoutSelecting: true,
                imageScoutPanelClosed: false
            }
        );
        const ok = await pingOrInject(tab.id);
        if (!ok) return;
        await send(tab.id, { type: 'SHOW_PANEL' });
        await send(tab.id, { type: 'ENTER_SELECTION' });
    }
);
chrome.tabs.onUpdated.addListener
(
    async (tabId, info, tab) => 
    {
        if (info.status !== 'complete') 
            return;
        const s = await chrome.storage.session.get(['imageScoutSelecting','imageScoutPanelClosed']);
        if (!s.imageScoutSelecting || s.imageScoutPanelClosed) 
            return;
        if (!tab?.url || isRestricted(tab.url)) 
            return;
        setTimeout
        (
            async () => 
            {
                const ok = await pingOrInject(tabId);
                if (!ok) return;
                await send(tabId, { type: 'SHOW_PANEL' });
                await send(tabId, { type: 'ENTER_SELECTION' });
            }, 
            120
        );
    }
);
chrome.runtime.onMessage.addListener
(
    (msg, sender, sendResponse) => 
    {
        (async () => 
        {
            if (msg?.type === '__ping__') 
                return sendResponse({ ok: true });

            if (msg?.type === 'GET_STATE') 
            {
                const s = await chrome.storage.session.get(['imageScoutSelecting','imageScoutPanelClosed']);
                return sendResponse
                (
                    {
                        selecting: !!s.imageScoutSelecting,
                        panelClosed: !!s.imageScoutPanelClosed
                    }
                );
            }

            if (msg?.type === 'IMAGE_SELECTED') 
            {
                await chrome.storage.session.set({ lastSelection: msg.payload });
                if (sender?.tab?.id) 
                    await send(sender.tab.id, { type: 'SELECTION_UPDATED', payload: msg.payload });
                return sendResponse({ ok: true });
            }

            if (msg?.type === 'GET_LAST') 
            {
                const { lastSelection } = await chrome.storage.session.get('lastSelection');
                return sendResponse({ selection: lastSelection || null });
            }

            if (msg?.type === 'FETCH_META') 
            {
            try 
            {
                const head = await fetch(msg.url, { method: 'HEAD', credentials: 'omit' }).catch(() => null);
                if (head && (head.ok || head.status === 405)) 
                {
                    const len  = head.headers.get('content-length');
                    const type = head.headers.get('content-type');
                    return sendResponse({ size: len ? Number(len) : null, type: type || null });
                }
                const res = await fetch(msg.url, { method: 'GET', credentials: 'omit' });
                const blob = await res.blob();
                return sendResponse({ size: blob.size, type: blob.type || null });
            } 
            catch 
            {
                return sendResponse({ size: null, type: null });
            }
        }

        if (msg?.type === 'DIRECT_DOWNLOAD') 
        {
            try 
            {
                await chrome.downloads.download
                (
                    {
                        url: msg.src,
                        filename: filenameFromUrl(msg.src, msg.contentType),
                        saveAs: true
                    }
                );
                return sendResponse({ ok: true });
            } 
            catch 
            {
                return sendResponse({ ok: false });
            }
        }

        if (msg?.type === 'DATAURL_DOWNLOAD') 
        {
        try 
        {
            const fname = msg.filename || filenameFromUrl(msg.originalUrl || 'image', msg.outType || 'image/png');
            await chrome.downloads.download({ url: msg.dataUrl, filename: fname, saveAs: true });
            return sendResponse({ ok: true });
        } 
        catch 
        {
            return sendResponse({ ok: false });
        }
    }
        if (msg?.type === 'CLOSE_ALL_PANELS') {
        await chrome.storage.session.set({
            imageScoutSelecting: false,
            imageScoutPanelClosed: true,
            lastSelection: null
        });
        const tabs = await chrome.tabs.query({ url: ['http://*/*','https://*/*'] });
        await Promise.all(tabs.map(t => send(t.id, { type: 'CLOSE_PANEL' })));
        return sendResponse({ ok: true });
        }
    })();
    return true;
});
function filenameFromUrl(url, contentType) 
{
    let base = 'image';
    try { const u = new URL(url); base = u.pathname.split('/').pop() || 'image'; }
    catch { base = (url.split('/').pop() || 'image'); }
    base = base.split('?')[0].split('#')[0];
    base = base.replace(/[%:<>\"\\\/\|\?\*]+/g, '_').trim();
    if (!base) 
        base = 'image';
    const ext = contentTypeToExt(contentType);
    if (/\.(png|jpe?g|webp|gif|svg|bmp|ico|tiff?)$/i.test(base)) 
    {
        if (ext) 
            base = base.replace(/\.(png|jpe?g|webp|gif|svg|bmp|ico|tiff?)$/i, `.${ext}`);
    } 
    else 
    {
        base = `${base}.${ext || 'png'}`;
    }
    if (base.startsWith('/')) base = base.slice(1);
    return base;
}
function contentTypeToExt(t) 
{
    if (!t) 
        return null;
    const x = String(t).split(';')[0].trim().toLowerCase();
    if (x === 'image/jpeg' || x === 'image/jpg') 
        return 'jpg';
    if (x === 'image/png') 
        return 'png';
    if (x === 'image/webp') 
        return 'webp';
    if (x === 'image/gif') 
        return 'gif';
    if (x === 'image/svg+xml') 
        return 'svg';
    if (x === 'image/bmp') 
        return 'bmp';
    if (x === 'image/x-icon' || x === 'image/vnd.microsoft.icon') 
        return 'ico';
    if (x === 'image/tiff') 
        return 'tif';
    return 'png';
}