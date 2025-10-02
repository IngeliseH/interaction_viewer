//all predictions
export function initCollapsibleSectionsSimple() {
    document.querySelectorAll('.sidebar-section .sidebar-title').forEach(title => {
        title.addEventListener('click', function() {
            const sidebarSection = this.closest('.sidebar-section');
            if (sidebarSection) {
                sidebarSection.classList.toggle('collapsed');
            }
        });
    });
}

//protein pair, interaction, protein
export function initCollapsibleSectionsComplex() {
    document.querySelectorAll('.sidebar-title, .content-section > .content-section-title').forEach(title => {
        title.addEventListener('click', function (event) {
            if (event.target.closest('.collapsible-subsection-title')) {
                return;
            }

            const isContentTitle = this.classList.contains('content-section-title');
            const isSidebarTitle = this.classList.contains('sidebar-title');

            if (isContentTitle) {
                const contentArea = this.closest('main.content-area');
                if (contentArea) {
                    contentArea.classList.toggle('collapsed');
                }
            } else if (isSidebarTitle) {
                const sidebarTitleH2 = this.querySelector('h2');
                const isMainPageSectionsSidebarTitle = sidebarTitleH2 && sidebarTitleH2.querySelector('i.fa-list-ul');

                const sidebarElement = this.closest('aside.sidebar');
                const parentGrid = this.closest('.main-content .grid');

                if (isMainPageSectionsSidebarTitle && sidebarElement && parentGrid) {
                    sidebarElement.classList.toggle('collapsed');
                    parentGrid.classList.toggle('sidebar-collapsed');
                } else {
                    const sectionToCollapse = this.closest('.sidebar-section');
                    if (sectionToCollapse) {
                        sectionToCollapse.classList.toggle('collapsed');
                    }
                }
            }
        });
    });

    document.querySelectorAll('.sidebar .sidebar-section ul li a').forEach(link => {
        link.addEventListener('click', function(event) {
            const targetId = this.getAttribute('href').substring(1);
            const targetSectionElement = document.getElementById(targetId);

            if (targetSectionElement) {
                const contentArea = targetSectionElement.closest('main.content-area');
                if (contentArea && contentArea.classList.contains('collapsed')) {
                    contentArea.classList.remove('collapsed');
                }
            }
        });
    });
}
