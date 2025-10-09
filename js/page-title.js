export function updatePageTitle(proteins=[], fragments=[]) {
    let title = ""
    if (!proteins || proteins.length === 0) {
        title = "Centrosome Predicted Interaction Data Explorer";
    } else {
        for (let i = 0; i < proteins.length; i++) {
            title += `${proteins[i]}`;
            if (fragments.length > i && fragments[i]) {
                if (fragments[i].includes(',')) {
                    const fragList = fragments[i].split(',').map(f => f.trim()).join(', ');
                    title += ` (Fragments: ${fragList})`;
                } else {
                    title += ` (Fragment ${fragments[i]})`;
                }
            }
            if (i < proteins.length - 1) {
                title += " + ";
            }
        }
    }
    document.title = title;
    const pageTitleElement = document.querySelector('.page-main-heading');
    if (pageTitleElement) {
        pageTitleElement.textContent = title;
    }
}