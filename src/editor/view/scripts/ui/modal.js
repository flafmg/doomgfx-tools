const Modal = {
    activeModal: null,
    container: null,

    init() {
        this.container = document.getElementById('modalContainer');
    },

    create(options) {
        const { title, content, onApply, onCancel, showFooter = true } = options;

        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.innerHTML = this.renderTemplate(title, content, showFooter);

        const modal = {
            element: backdrop,
            onApply,
            onCancel
        };

        this.bindModalEvents(modal);

        return modal;
    },

    renderTemplate(title, content, showFooter) {
        return `
            <div class="modal">
                <div class="modal-header">
                    <span class="modal-title">${title}</span>
                    <button class="modal-close" type="button">×</button>
                </div>
                <div class="modal-content">
                    ${content}
                </div>
                ${showFooter ? `
                <div class="modal-footer">
                    <button class="modal-btn modal-btn-secondary modal-cancel" type="button">Cancel</button>
                    <button class="modal-btn modal-btn-primary modal-apply" type="button">Apply</button>
                </div>
                ` : ''}
            </div>
        `;
    },

    bindModalEvents(modal) {
        const backdrop = modal.element;
        const closeBtn = backdrop.querySelector('.modal-close');
        const cancelBtn = backdrop.querySelector('.modal-cancel');
        const applyBtn = backdrop.querySelector('.modal-apply');

        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                this.close();
            }
        });

        closeBtn.addEventListener('click', () => this.close());

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                if (modal.onCancel) modal.onCancel();
                this.close();
            });
        }

        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                if (modal.onApply) modal.onApply();
                this.close();
            });
        }

        backdrop.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (modal.onCancel) modal.onCancel();
                this.close();
            } else if (e.key === 'Enter' && applyBtn) {
                if (modal.onApply) modal.onApply();
                this.close();
            }
        });
    },

    open(modal) {
        if (this.activeModal) {
            this.close();
        }

        this.activeModal = modal;
        this.container.appendChild(modal.element);
        
        const firstInput = modal.element.querySelector('input, button:not(.modal-close)');
        if (firstInput) {
            firstInput.focus();
        }
    },

    close() {
        if (this.activeModal) {
            this.activeModal.element.remove();
            this.activeModal = null;
        }
    },

    isOpen() {
        return this.activeModal !== null;
    }
};
