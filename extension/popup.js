const els = 
{
    start: document.getElementById('start'),
    stop: document.getElementById('stop'),
    status: document.getElementById('status'),
    url: document.getElementById('url'),
    disp: document.getElementById('disp'),
    nat: document.getElementById('nat'),
    ctype: document.getElementById('ctype'),
    fsize: document.getElementById('fsize'),
    outW: document.getElementById('outW'),
    outH: document.getElementById('outH'),
    format: document.getElementById('format'),
    quality: document.getElementById('quality'),
    download: document.getElementById('download')
};

let selection = null; 
let meta = { size: null, type: null }; 
let naturalRatio = null;

function bytesToHuman(n) 
{
    if (n == null) 
        return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0, val = Number(n);
    while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
        return `${val.toFixed(2)} ${units[i]}`;
}
async function fetchMeta(url) 
{
    try 
    {
        const head = await fetch(url, { method: 'HEAD', credentials: 'include' });
        const len = head.headers.get('content-length');
        const type = head.headers.get('content-type');
        if (len || type) return { size: len ? Number(len) : null, type: type || null };
    } 
    catch (_) 
    {}
    try 
    {
        const res = await fetch(url, { method: 'GET', credentials: 'include' });
        const blob = await res.blob();
        return { size: blob.size, type: blob.type || null };
    } 
    catch (_) 
    {
        return { size: null, type: null };
    }
}
function updateUI() 
{
    if (!selection) 
        {
        els.url.value = '';
        els.disp.value = '';
        els.nat.value = '';
        els.ctype.value = '';
        els.fsize.value = '';
        els.status.textContent = 'Idle';
        return;
    }

    els.url.value = selection.src || '';
    els.disp.value = `${selection.displayedWidth} × ${selection.displayedHeight}px`;
    els.nat.value = `${selection.naturalWidth} × ${selection.naturalHeight}px`;
    naturalRatio = selection.naturalWidth && selection.naturalHeight ? selection.naturalWidth / selection.naturalHeight : null;
    els.status.textContent = 'Image selected';

    if (selection.naturalWidth && !els.outW.value) els.outW.value = selection.naturalWidth;
    if (selection.naturalHeight && !els.outH.value) els.outH.value = selection.naturalHeight;

    els.ctype.value = meta.type || '—';
    els.fsize.value = bytesToHuman(meta.size);
}
function syncAspect(source) 
{
    if (source === 'W' && els.outW.value) 
        els.outH.value = Math.round(Number(els.outW.value) / naturalRatio);
    else if (source === 'H' && els.outH.value) 
        els.outW.value = Math.round(Number(els.outH.value) * naturalRatio);
}
async function startSelection() 
{
    els.status.textContent = 'Selection mode…';
    await chrome.runtime.sendMessage({ type: 'START_SELECT' });
}
async function stopSelection() 
{
    els.status.textContent = 'Stopped';
    await chrome.runtime.sendMessage({ type: 'STOP_SELECT' });
}
async function init() 
{
    const resp = await chrome.runtime.sendMessage({ type: 'GET_LAST' });
    if (resp?.selection) 
    {
        selection = resp.selection;
        meta = await fetchMeta(selection.src);
        updateUI();
    }
}
chrome.runtime.onMessage.addListener
(
    async (msg) => 
    {
        if (msg?.type === 'SELECTION_UPDATED') 
        {
            selection = msg.payload;
            meta = await fetchMeta(selection.src);

            els.outW.value = selection.naturalWidth || '';
            els.outH.value = selection.naturalHeight || '';
            updateUI();
        }
    }
);

els.start.addEventListener('click', startSelection);
els.stop.addEventListener('click', stopSelection);

els.outW.addEventListener('input', () => syncAspect('W'));
els.outH.addEventListener('input', () => syncAspect('H'));

els.download.addEventListener
('click', async () => 
    {
        if (!selection?.src) return;

        const res = await fetch(selection.src, { credentials: 'include' });
        const blob = await res.blob();

        const bitmap = await createImageBitmap(blob);

        let w = parseInt(els.outW.value || bitmap.width, 10);
        let h = parseInt(els.outH.value || bitmap.height, 10);

        if (els.lock.checked && naturalRatio) 
        {
            if (els.outW.value && !els.outH.value) h = Math.round(w / naturalRatio);
            if (!els.outW.value && els.outH.value) w = Math.round(h * naturalRatio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, w);
        canvas.height = Math.max(1, h);
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

        let outType = els.format.value;

        if (outType === 'original' || !/^image\//.test(outType)) 
        {
            outType = meta.type || blob.type || 'image/png';
        }

        const quality = Math.min(1, Math.max(0.1, Number(els.quality.value) || 0.92));

        const outBlob = await new Promise((resolve) => canvas.toBlob(resolve, outType, quality) );

        const url = URL.createObjectURL(outBlob);
        const filename = els.fname.value?.trim() || 'image-scout-output';

        await chrome.downloads.download({ url, filename, saveAs: true });
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
);
init();