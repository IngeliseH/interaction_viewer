export function showTooltip(target, content) {
    hideAllTooltips();
    const tooltip = document.createElement('div');
    tooltip.className = 'info-tooltip visible';
    tooltip.innerHTML = content;
    document.body.appendChild(tooltip);

    const targetRect = target.getBoundingClientRect();
    tooltip.style.position = 'absolute';
    tooltip.style.top = `${targetRect.bottom + window.scrollY + 5}px`;
    tooltip.style.left = `${targetRect.left + window.scrollX}px`;
    tooltip.style.zIndex = '1010';
}

export function hideAllTooltips() {
    document.querySelectorAll('.info-tooltip.visible').forEach(tt => tt.remove());
}

export function initTooltips(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;

    container.addEventListener('click', (e) => {
        const infoBtn = e.target.closest('.info-btn');
        if (infoBtn) {
            e.preventDefault();
            e.stopPropagation();
            const tooltipContent = infoBtn.dataset.tooltip || (infoBtn.parentNode.dataset.tooltip || infoBtn.parentNode.parentNode.dataset.tooltip);
            if (tooltipContent) {
                showTooltip(infoBtn, tooltipContent);
            }
        }
    });
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.info-btn') && !e.target.closest('.info-tooltip')) {
        hideAllTooltips();
    }
});
