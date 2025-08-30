let selecting = false;
let handlersAttached = false;
let hoverStyleEl = null;

function attachHandlers() 
{
    if (handlersAttached) return;
    handlersAttached = true;

    hoverStyleEl = document.createElement('style');
    hoverStyleEl.textContent = 
    `
        img:hover 
        {
            outline: 2px solid #3b82f6 !important;
            cursor: crosshair !important;
        }
    `;
    document.documentElement.appendChild(hoverStyleEl);
    document.addEventListener
    (
        'click',
        onClick,
        true 
    );
}
function detachHandlers() 
{
    if (!handlersAttached) return;
    handlersAttached = false;
    if (hoverStyleEl?.parentNode) hoverStyleEl.parentNode.removeChild(hoverStyleEl);
    hoverStyleEl = null;
    document.removeEventListener('click', onClick, true);
}
function onClick(e) 
{
    if (!selecting) return;
    const img = e.target.closest('img');
    if (!img) return;

    e.preventDefault();
    e.stopPropagation();

    const src = img.currentSrc || img.src || '';
    const payload = 
    {
        src,
        alt: img.alt || '',
        naturalWidth: img.naturalWidth || null,
        naturalHeight: img.naturalHeight || null,
        displayedWidth: Math.round(img.getBoundingClientRect().width),
        displayedHeight: Math.round(img.getBoundingClientRect().height)
    };
    chrome.runtime.sendMessage({ type: 'IMAGE_SELECTED', payload });
}
chrome.runtime.onMessage.addListener
(
    (msg) => 
    {
        if (msg?.type === 'ENTER_SELECTION') 
        {
            selecting = true;
            attachHandlers();
        }
        if (msg?.type === 'EXIT_SELECTION') 
        {
            selecting = false;
            detachHandlers();
        }
    }
);
