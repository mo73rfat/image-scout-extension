async function getActiveTabId() 
{
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.id;
}
async function setLastSelection(sel) 
{
    await chrome.storage.session.set({ lastSelection: sel });
}
async function getLastSelection() 
{
    const { lastSelection } = await chrome.storage.session.get('lastSelection');
    return lastSelection || null;
}
chrome.runtime.onMessage.addListener
(
    (msg, sender, sendResponse) => 
    {
        (async () => 
            {
                if (msg?.type === 'START_SELECT') 
                {
                    const tabId = await getActiveTabId();
                    if (!tabId) return;
                    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
                    
                    await chrome.tabs.sendMessage(tabId, { type: 'ENTER_SELECTION' });
                    sendResponse({ ok: true });
                }
                if (msg?.type === 'STOP_SELECT') 
                {
                    const tabId = await getActiveTabId();
                    if (tabId) await chrome.tabs.sendMessage(tabId, { type: 'EXIT_SELECTION' });
                    sendResponse({ ok: true });
                }
                if (msg?.type === 'GET_LAST') 
                {
                    sendResponse({ selection: await getLastSelection() });
                }
                if (msg?.type === 'IMAGE_SELECTED') 
                {
                    await setLastSelection(msg.payload);
                    chrome.runtime.sendMessage({ type: 'SELECTION_UPDATED', payload: msg.payload });
                    sendResponse({ ok: true });
                }
            }
        )
        ();
        return true;
    }
);