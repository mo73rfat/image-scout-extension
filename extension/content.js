if (!globalThis.__imageScoutInjected) 
{
    globalThis.__imageScoutInjected = true;
    let selecting = false;
    let hoverStyleEl = null;
    let panelHost = null, panelRoot = null, panel = null;
    let selection = null, meta = { size: null, type: null };
    let els = {};
    function ensurePanel() 
    {
        if (panelHost) return;

        panelHost = document.createElement('div');
        panelHost.style.position = 'fixed';
        panelHost.style.top = '20px';
        panelHost.style.right = '20px';
        panelHost.style.zIndex = '2147483647';
        panelHost.style.width = '360px';
        panelRoot = panelHost.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = 
        `
            .wrap { font-family: system-ui,-apple-system,Segoe UI,Roboto,sans-serif; background:#fff; border-radius:12px; box-shadow:0 12px 30px rgba(0,0,0,.25); border:1px solid #e5e7eb; transform-origin: top right; }
            .header { background:#1f2937; color:#fff; padding:10px 12px; display:flex; justify-content:space-between; align-items:center; font-weight:700; border-top-left-radius:12px; border-top-right-radius:12px; }
            .content { padding:10px 12px; }
            .group-title { font-size:12px; letter-spacing:.06em; opacity:.7; margin:6px 0 4px; }
            .row { display:flex; gap:8px; align-items:center; margin:6px 0; }
            .row label { width:120px; font-size:12px; opacity:.75; }
            input, select { flex:1; padding:7px 9px; border:1px solid #d1d5db; border-radius:8px; }
            .read input { background:#f9fafb; }
            #download { width:100%; background:#2563eb; color:#fff; border:0; border-radius:10px; padding:10px 12px; font-weight:700; cursor:pointer; margin-top:8px; }
            #close { background:#ef4444; color:#fff; border:0; border-radius:8px; padding:6px 10px; cursor:pointer; }
            .hr { height:1px; background:#eee; margin:10px 0; }
            img:hover {
                outline: 6px solid #2563eb !important;
                outline-offset: 0 !important;
                box-shadow: 0 0 0 4px rgba(37,99,235,0.35), 0 0 18px rgba(37,99,235,0.8) !important;
                cursor: crosshair !important;
            }
            @keyframes panelPulse { 0%{transform:scale(1)} 50%{transform:scale(1.02)} 100%{transform:scale(1)} }
            .pulse { animation: panelPulse 220ms ease; }
        `;
        panelRoot.appendChild(style);
        panel = document.createElement('div');
        panel.className = 'wrap';
        panel.innerHTML = 
        `
            <div class="header">
                <span>Image Scout</span>
                <button id="close">×</button>
            </div>
            <div class="content">
                <div class="group-title">Info</div>
                <div class="row read"><label>URL</label><input id="url" readonly></div>
                <div class="row read"><label>Displayed</label><input id="disp" readonly></div>
                <div class="row read"><label>Natural</label><input id="nat" readonly></div>
                <div class="row read"><label>Type</label><input id="ctype" readonly></div>
                <div class="row read"><label>File size</label><input id="fsize" readonly></div>

                <div class="hr"></div>

                <div class="group-title">Controls</div>
                <div class="row"><label>Width</label><input id="outW" type="number" min="1" placeholder="auto"></div>
                <div class="row"><label>Height</label><input id="outH" type="number" min="1" placeholder="auto"></div>
                <div class="row">
                <label>Format</label>
                <select id="format">
                    <option value="original">Original</option>
                    <option value="image/jpeg">JPEG</option>
                    <option value="image/png">PNG</option>
                    <option value="image/webp">WEBP</option>
                </select>
                </div>
                <div class="row"><label>Quality</label><input id="quality" type="number" step="0.05" min="0.1" max="1" value="0.92"></div>
                <button id="download">Download</button>
            </div>
        `;
        panelRoot.appendChild(panel);
        document.documentElement.appendChild(panelHost);
        els = 
        {
            close: panelRoot.getElementById('close'),
            url: panelRoot.getElementById('url'),
            disp: panelRoot.getElementById('disp'),
            nat: panelRoot.getElementById('nat'),
            ctype: panelRoot.getElementById('ctype'),
            fsize: panelRoot.getElementById('fsize'),
            outW: panelRoot.getElementById('outW'),
            outH: panelRoot.getElementById('outH'),
            format: panelRoot.getElementById('format'),
            quality: panelRoot.getElementById('quality'),
            download: panelRoot.getElementById('download')
        };
        els.close.addEventListener
        (
            'click', async () => 
            {
                try 
                {
                    await chrome.runtime.sendMessage({ type: 'CLOSE_ALL_PANELS' });
                } 
                catch 
                {}
                if (panelHost?.parentNode) 
                    panelHost.parentNode.removeChild(panelHost);
                panelHost = null; panelRoot = null; panel = null; els = {};
                selecting = false;
                detachHover();
            }
        );
        els.download.addEventListener('click', onDownload);
    }
    function attachHover() 
    {
        if (hoverStyleEl) 
            return;
        hoverStyleEl = document.createElement('style');
        hoverStyleEl.textContent = 
        `
            img:hover 
            {
                outline: 6px solid #2563eb !important;
                outline-offset: 0 !important;
                box-shadow: 0 0 0 4px rgba(37,99,235,0.35), 0 0 18px rgba(37,99,235,0.8) !important;
                cursor: crosshair !important;
            }
        `;
        document.documentElement.appendChild(hoverStyleEl);
        document.addEventListener('click', onClick, true);
    }
    function detachHover() 
    {
        if (!hoverStyleEl) 
            return;
        if (hoverStyleEl.parentNode) 
            hoverStyleEl.parentNode.removeChild(hoverStyleEl);
        hoverStyleEl = null;
        document.removeEventListener('click', onClick, true);
    }
    function onClick(e) 
    {
        if (!selecting) 
            return;
        if (panelHost && (e.target === panelHost || panelHost.contains(e.target))) 
            return;
        const img = e.target.closest && e.target.closest('img');
        if (!img) 
            return;
        e.preventDefault();
        e.stopPropagation();
        const r = img.getBoundingClientRect();
        const payload = 
        {
            src: img.currentSrc || img.src || '',
            alt: img.alt || '',
            naturalWidth: img.naturalWidth || 0,
            naturalHeight: img.naturalHeight || 0,
            displayedWidth: Math.round(r.width),
            displayedHeight: Math.round(r.height)
        };
        chrome.runtime.sendMessage({ type: 'IMAGE_SELECTED', payload });
    }

    function bytesToHuman(n) 
    {
        if (n == null) 
            return '—';
        const u = ['B','KB','MB','GB'];
        let i = 0, v = Number(n);
        while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
        return `${v.toFixed(2)} ${u[i]}`;
    }
    function dimText(w,h) 
    {
        return `${Number(w)} × ${Number(h)} pixel`;
    }
    function fetchMeta(url) 
    {
        return new Promise((resolve) => { chrome.runtime.sendMessage({ type: 'FETCH_META', url }, (resp) => resolve(resp || { size: null, type: null })); });
    }
    async function refreshUI() 
    {
        if (!selection || !panelRoot) 
            return;
        els.url.value  = selection.src || '';
        els.disp.value = dimText(selection.displayedWidth, selection.displayedHeight);
        els.nat.value  = dimText(selection.naturalWidth, selection.naturalHeight);
        const m = await fetchMeta(selection.src);
        meta = m || { size: null, type: null };
        els.ctype.value = meta.type || '—';
        els.fsize.value = bytesToHuman(meta.size);
        els.outW.value = String(selection.naturalWidth || 0);
        els.outH.value = String(selection.naturalHeight || 0);

        panel.classList.remove('pulse'); void panel.offsetWidth; panel.classList.add('pulse');
    }

    function extFor(type) 
    {
        const t = String(type || '').split(';')[0].toLowerCase();
        if (t === 'image/jpeg' || t === 'image/jpg') return 'jpg';
        if (t === 'image/png') return 'png';
        if (t === 'image/webp') return 'webp';
        return 'png';
    }
    function filenameWithFormat(srcUrl, outType) 
    {
        let base = 'image';
        try { const u = new URL(srcUrl); base = u.pathname.split('/').pop() || 'image'; }
        catch { base = (srcUrl.split('/').pop() || 'image'); }
        base = base.split('?')[0].split('#')[0];
        base = base.replace(/[%:<>\"\\\/\|\?\*]+/g, '_').trim() || 'image';
        const ext = extFor(outType);
        if (/\.(png|jpe?g|webp|gif|svg|bmp|ico|tiff?)$/i.test(base)) 
            base = base.replace(/\.(png|jpe?g|webp|gif|svg|bmp|ico|tiff?)$/i, `.${ext}`);
        else 
            base = `${base}.${ext}`;
        if (base.startsWith('/')) base = base.slice(1);
            return base;
    }
    async function drawToCanvas(srcUrl, width, height) 
    {
        const imgEl = new Image();
        imgEl.crossOrigin = 'anonymous';
        imgEl.decoding = 'async';
        imgEl.loading = 'eager';
        return new Promise
        (
            (resolve, reject) => 
            {
                imgEl.onload = () => 
                {
                    try 
                    {
                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.imageSmoothingEnabled = true;
                        ctx.imageSmoothingQuality = 'high';
                        ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);
                        resolve(canvas);
                    } 
                    catch (e) 
                    { reject(e); }
                };
                imgEl.onerror = () => reject(new Error('image load error'));
                imgEl.src = srcUrl;
            }
        );
    }
    async function onDownload() 
    {
        if (!selection?.src) return;
        const src = selection.src;
        const format = els.format.value;
        const w = Math.max(1, parseInt(els.outW.value, 10));
        const h = Math.max(1, parseInt(els.outH.value, 10));

        if (format === 'original' &&
            w === Number(selection.naturalWidth) &&
            h === Number(selection.naturalHeight)) 
        {
            chrome.runtime.sendMessage({ type: 'DIRECT_DOWNLOAD', src, contentType: meta.type });
            return;
        }
        try 
        {
        const canvas = await drawToCanvas(src, w, h);
        const q = Math.min(1, Math.max(0.1, Number(els.quality.value) || 0.92));
        const outType = (format === 'original') ? (meta.type || 'image/png') : format;
        const dataUrl = canvas.toDataURL(outType, q);
        const filename = filenameWithFormat(src, outType);
        chrome.runtime.sendMessage
        (
            {
                type: 'DATAURL_DOWNLOAD',
                dataUrl,
                outType,
                filename,
                originalUrl: src
            }
        );
        } 
        catch 
        {
            chrome.runtime.sendMessage({ type: 'DIRECT_DOWNLOAD', src, contentType: meta.type });
        }
    }
    chrome.runtime.onMessage.addListener
    (
        async (msg) => 
        {
            if (msg?.type === '__ping__') 
                return;
            if (msg?.type === 'SHOW_PANEL') 
                ensurePanel();
            if (msg?.type === 'ENTER_SELECTION') 
            { 
                selecting = true; 
                attachHover(); 
            }
            if (msg?.type === 'CLOSE_PANEL') 
            {
                if (panelHost?.parentNode) 
                    panelHost.parentNode.removeChild(panelHost);
                panelHost = null; panelRoot = null; panel = null; els = {};
                selecting = false;
                detachHover();
            }
            if (msg?.type === 'SELECTION_UPDATED') 
            {
                selection = msg.payload;
                if (!panelHost) ensurePanel();
                    await refreshUI();
            }
        }
    );
    (
        async () => 
        {
            try 
            {
                const state = await new Promise(res => chrome.runtime.sendMessage({ type: 'GET_STATE' }, res));
                if (!state || state.panelClosed || !state.selecting) 
                    return;
                ensurePanel();
                const resp = await chrome.runtime.sendMessage({ type: 'GET_LAST' });
                if (resp?.selection) 
                {
                    selection = resp.selection;
                    await refreshUI();
                }
            } 
            catch 
            {}
        }
    )();
}