import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'warning',
  isLoading = false
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const variantColors = {
    danger: 'bg-red-500',
    warning: 'bg-amber-500',
    info: 'bg-primary-500'
  };

  const buttonColors = {
    danger: 'btn-danger',
    warning: 'bg-amber-500 hover:bg-amber-600 text-white',
    info: 'btn-primary'
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      onConfirm();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
    >
      <div
        className="bg-white dark:bg-neutral-900 border-2 border-neutral-200 dark:border-neutral-800 rounded-lg max-w-md w-full shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-start gap-4">
              <div className={`p-3 ${variantColors[variant]} rounded-md flex-shrink-0`}>
                <AlertTriangle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 id="confirm-dialog-title" className="text-xl font-bold text-neutral-900 dark:text-white mb-2">
                  {title}
                </h3>
                <p id="confirm-dialog-description" className="text-neutral-600 dark:text-neutral-400">
                  {message}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors p-3 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex gap-3 justify-end mt-6">
            <button
              onClick={onClose}
              className="btn-ghost"
              disabled={isLoading}
              aria-label={cancelText}
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              className={buttonColors[variant]}
              disabled={isLoading}
              aria-label={confirmText}
            >
              {isLoading ? 'Processing...' : confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
