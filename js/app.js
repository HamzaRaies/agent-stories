// Story-to-Scene Agent - Main Logic with Authentication & API Integration

// Prevent page reload on errors and filter browser extension errors
window.addEventListener('error', (e) => {
    // Ignore browser extension errors
    if (e.filename && (e.filename.includes('extension') || e.filename.includes('chrome-extension') || e.filename.includes('ab-idea') || e.filename.includes('gethtml'))) {
        e.preventDefault();
        return false;
    }
    console.error('Global error:', e);
});

// Filter console errors from browser extensions
const originalError = console.error;
console.error = function (...args) {
    const message = args.join(' ');
    if (message.includes('ab-idea') || message.includes('gethtml') || message.includes('runtime.lastError') || message.includes('chrome-extension')) {
        return;
    }
    originalError.apply(console, args);
};

// Global variable for active kebab button
let activeKebabBtn = null;

window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled promise rejection:', e.reason);
    // Prevent default behavior that might reload page
    e.preventDefault();
});

// API Configuration - Uses environment variable or defaults to current origin
const API_BASE_URL = window.API_BASE_URL || (window.location.origin.includes('localhost') ? 'http://localhost:8000' : window.location.origin);
let authToken = localStorage.getItem('authToken');
let currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
let currentStoryId = null; // Track the currently loaded story

// Prevent multiple initializations and concurrent history loads
window._appInitialized = window._appInitialized || false;
let isLoadingHistory = false;
let isGeneratingStory = false; // Flag to prevent reloads during story generation

// Custom Modal Functions
function showConfirmModal(title, message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-title');
        const messageEl = document.getElementById('confirm-message');
        const okBtn = document.getElementById('confirm-ok');
        const cancelBtn = document.getElementById('confirm-cancel');

        if (!modal || !titleEl || !messageEl || !okBtn || !cancelBtn) {
            resolve(false);
            return;
        }

        titleEl.textContent = title;
        messageEl.textContent = message;
        modal.classList.add('active');

        const cleanup = () => {
            modal.classList.remove('active');
            okBtn.onclick = null;
            cancelBtn.onclick = null;
        };

        okBtn.onclick = () => {
            cleanup();
            resolve(true);
        };

        cancelBtn.onclick = () => {
            cleanup();
            resolve(false);
        };

        // Close on backdrop click
        const backdropHandler = (e) => {
            if (e.target === modal) {
                cleanup();
                modal.removeEventListener('click', backdropHandler);
                resolve(false);
            }
        };
        modal.addEventListener('click', backdropHandler);
    });
}

function showStoryLimitModal() {
    return new Promise((resolve) => {
        const modal = document.getElementById('story-limit-modal');
        if (!modal) {
            resolve(null);
            return;
        }

        modal.classList.add('active');

        const cleanup = () => {
            modal.classList.remove('active');
        };

        const newChatBtn = document.getElementById('story-limit-new-chat');
        const upgradeBtn = document.getElementById('story-limit-upgrade');
        const cancelBtn = document.getElementById('story-limit-cancel');

        const handleNewChat = () => {
            cleanup();
            resolve('new');
        };

        const handleUpgrade = () => {
            cleanup();
            resolve('upgrade');
        };

        const handleCancel = () => {
            cleanup();
            resolve(null);
        };

        newChatBtn.onclick = handleNewChat;
        upgradeBtn.onclick = handleUpgrade;
        cancelBtn.onclick = handleCancel;

        // Close on backdrop click
        const backdropHandler = (e) => {
            if (e.target === modal) {
                cleanup();
                modal.removeEventListener('click', backdropHandler);
                resolve(null);
            }
        };
        modal.addEventListener('click', backdropHandler);
    });
}

function showInputModal(title, message, label, placeholder, defaultValue = '') {
    return new Promise((resolve) => {
        const modal = document.getElementById('input-modal');
        const titleEl = document.getElementById('input-title');
        const messageEl = document.getElementById('input-message');
        const labelEl = document.getElementById('input-label');
        const inputEl = document.getElementById('input-field');
        const form = document.getElementById('input-form');
        const cancelBtn = document.getElementById('input-cancel');

        if (!modal || !titleEl || !messageEl || !labelEl || !inputEl || !form || !cancelBtn) {
            resolve(null);
            return;
        }

        titleEl.textContent = title;
        messageEl.textContent = message;
        labelEl.textContent = label;
        inputEl.placeholder = placeholder;
        inputEl.value = defaultValue;
        modal.classList.add('active');
        inputEl.focus();
        inputEl.select();

        const cleanup = () => {
            modal.classList.remove('active');
            form.onsubmit = null;
            cancelBtn.onclick = null;
            modal.onclick = null;
        };

        form.onsubmit = (e) => {
            e.preventDefault();
            const value = inputEl.value.trim();
            if (value) {
                cleanup();
                resolve(value);
            }
        };

        cancelBtn.onclick = () => {
            cleanup();
            resolve(null);
        };

        // Close on backdrop click
        const backdropHandler = (e) => {
            if (e.target === modal) {
                cleanup();
                modal.removeEventListener('click', backdropHandler);
                resolve(null);
            }
        };
        modal.addEventListener('click', backdropHandler);
    });
}

// Toast Notification System
function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) {
        // Create container if it doesn't exist
        const newContainer = document.createElement('div');
        newContainer.id = 'toast-container';
        newContainer.className = 'toast-container';
        document.body.appendChild(newContainer);
        return showToast(message, type, duration);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
        error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ff5555" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>',
        info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
    };

    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || icons.info}</div>
        <div class="toast-content">${message}</div>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `;

    container.appendChild(toast);

    // Auto remove after duration
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, duration);

    return toast;
}

// Utility Functions
function showError(element, message) {
    if (element) {
        element.textContent = message;
        element.classList.remove('hidden');
    }
}

function hideError(element) {
    if (element) {
        element.classList.add('hidden');
    }
}

function makeAPICall(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    // Only add auth token if available (public endpoints don't require it)
    if (authToken && !options.skipAuth) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }

    // Ensure method is uppercase for consistency
    const method = options.method ? options.method.toUpperCase() : 'GET';

    const fetchOptions = {
        method: method,
        headers
    };

    // Only include body for methods that support it
    if (['POST', 'PUT', 'PATCH'].includes(method) && options.body) {
        fetchOptions.body = options.body;
    }

    return fetch(url, fetchOptions).then(async response => {
        // Handle empty responses (like DELETE 204 or 200 with no body)
        if (response.status === 204) {
            return { message: 'Success' };
        }

        // Check if response has content
        const contentType = response.headers.get('content-type');
        const hasJsonContent = contentType && contentType.includes('application/json');

        // Handle 401 Unauthorized - clear invalid token and prompt login
        if (response.status === 401) {
            // Don't clear token on login/register endpoints (those are expected to fail)
            const isAuthEndpoint = endpoint.includes('/auth/login') || endpoint.includes('/auth/register');
            
            // Parse error message first (before clearing token)
            let errorMessage = 'Authentication required. Please log in.';
            if (hasJsonContent) {
                try {
                    const errorData = await response.clone().json();
                    errorMessage = errorData.detail || errorMessage;
                } catch (e) {
                    // If JSON parse fails, try text
                    try {
                        const errorText = await response.clone().text();
                        if (errorText) errorMessage = errorText;
                    } catch (e2) {
                        // Ignore parse errors
                    }
                }
            }
            
            // Clear invalid/expired token (but not on auth endpoints)
            if (authToken && !isAuthEndpoint) {
                // Check if it's a token-related error (not just wrong password)
                const isTokenError = errorMessage.toLowerCase().includes('token') || 
                                    errorMessage.toLowerCase().includes('expired') || 
                                    errorMessage.toLowerCase().includes('invalid') && 
                                    !errorMessage.toLowerCase().includes('password') &&
                                    !errorMessage.toLowerCase().includes('email');
                
                if (isTokenError) {
                    console.warn('Authentication failed - clearing invalid token:', errorMessage);
                    authToken = null;
                    currentUser = null;
                    localStorage.removeItem('authToken');
                    localStorage.removeItem('currentUser');
                    updateUIForAuthState(false);
                    
                    // Show login modal if not already shown and not a public endpoint
                    if (!options.skipAuth) {
                        const loginModal = document.getElementById('login-modal');
                        if (loginModal && !loginModal.classList.contains('active')) {
                            loginModal.classList.add('active');
                            showToast('Your session expired. Please log in again.', 'info', 3000);
                        }
                    }
                }
            }
            
            throw new Error(errorMessage);
        }

        if (!response.ok) {
            // Try to parse error message from JSON if available
            if (hasJsonContent) {
                try {
                    const errorData = await response.json();
                    let errorMsg = errorData.detail || errorData.message;

                    // Handle validation errors (array of objects)
                    if (Array.isArray(errorMsg)) {
                        errorMsg = errorMsg.map(e => e.msg).join(', ');
                    }

                    if (!errorMsg) {
                        errorMsg = `Request failed with status ${response.status}`;
                    }
                    throw new Error(errorMsg);
                } catch (parseError) {
                    // If JSON parsing fails (or custom parsing fails), rethrow if it's our own error, else generic
                    if (parseError.message !== 'Unexpected token < in JSON at position 0') {
                        throw parseError; // Rethrow existing error info
                    }
                    throw new Error(`HTTP ${response.status}: ${response.statusText || 'Request failed'}`);
                }
            } else {
                // For non-JSON error responses, provide a more descriptive error
                let errorMsg = `HTTP ${response.status}: ${response.statusText || 'Request failed'}`;
                if (response.status === 405) {
                    errorMsg = `Method Not Allowed: The ${method} method is not supported for this endpoint`;
                } else if (response.status === 404) {
                    errorMsg = 'Resource not found';
                } else if (response.status === 401) {
                    // Handle 401 - clear token and prompt login
                    if (authToken) {
                        authToken = null;
                        currentUser = null;
                        localStorage.removeItem('authToken');
                        localStorage.removeItem('currentUser');
                        updateUIForAuthState(false);
                        
                        if (!options.skipAuth) {
                            const loginModal = document.getElementById('login-modal');
                            if (loginModal && !loginModal.classList.contains('active')) {
                                loginModal.classList.add('active');
                                showToast('Please log in to continue', 'info', 3000);
                            }
                        }
                    }
                    errorMsg = 'Authentication required. Please log in.';
                } else if (response.status === 403) {
                    errorMsg = 'Forbidden: You do not have permission to perform this action';
                }
                throw new Error(errorMsg);
            }
        }

        // Handle successful non-JSON responses
        if (!hasJsonContent) {
            return { message: 'Success' };
        }

        // Parse and return JSON response
        const data = await response.json();
        return data;
    }).catch(error => {
        // Better error handling
        console.error('API call error:', error);
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.name === 'TypeError') {
            const errorMsg = 'Cannot connect to server. Make sure the backend is running on http://localhost:8000';
            console.error(errorMsg);
            // Show user-friendly error in chat feed if it exists
            const chatFeed = document.getElementById('chat-feed');
            if (chatFeed && chatFeed.children.length === 0) {
                chatFeed.innerHTML = `<div class="bubble ai-bubble"><div class="bubble-content"><p style="color: #ff5555;">⚠️ ${errorMsg}</p><p style="font-size: 0.85rem; margin-top: 8px; color: var(--text-muted);">Please start the backend server by running: <code>python main.py</code></p></div></div>`;
            }
            throw new Error(errorMsg);
        }
        throw error;
    });
}

// Authentication Functions
function login(email, password) {
    return makeAPICall('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
    }).then(data => {
        authToken = data.access_token;
        currentUser = data.user;
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        return data;
    });
}

function signup(username, email, password) {
    return makeAPICall('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password })
    }).then(data => {
        // After signup, auto-login
        return login(email, password);
    });
}

function logout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    updateUIForAuthState(false);
}

function updateUIForAuthState(isLoggedIn) {
    const sidebar = document.getElementById('sidebar');
    const authButtons = document.getElementById('auth-buttons');
    const userActions = document.getElementById('user-actions');
    const contextTitle = document.getElementById('context-title');
    const userName = document.getElementById('user-name');
    const userAvatar = document.getElementById('user-avatar');
    const userPlan = document.getElementById('user-plan');

    if (isLoggedIn) {
        sidebar?.classList.remove('hidden');
        authButtons?.classList.add('hidden');
        userActions?.classList.remove('hidden');
        if (currentUser) {
            contextTitle.textContent = `Welcome, ${currentUser.username}`;
            // Update sidebar user info
            if (userName) userName.textContent = currentUser.username;
            if (userAvatar) {
                const initials = currentUser.username.substring(0, 2).toUpperCase();
                userAvatar.textContent = initials;
            }
            if (userPlan) userPlan.textContent = currentUser.plan || 'Free';
        }
    } else {
        sidebar?.classList.add('hidden');
        authButtons?.classList.remove('hidden');
        userActions?.classList.add('hidden');
        contextTitle.textContent = 'Untitled Story';
        // Reset user info
        if (userName) userName.textContent = 'Guest';
        if (userAvatar) userAvatar.textContent = 'U';
        if (userPlan) userPlan.textContent = 'Free';
    }
}

// Check auth state on load
if (authToken && currentUser) {
    updateUIForAuthState(true);
} else {
    updateUIForAuthState(false);
}

document.addEventListener('DOMContentLoaded', () => {
    // Check for shared story in URL
    const urlParams = new URLSearchParams(window.location.search);
    const sharedStoryId = urlParams.get('story');
    if (sharedStoryId) {
        // Store story ID to load after authentication check
        window.pendingSharedStoryId = parseInt(sharedStoryId, 10);
    }

    // 1. Loader Logic - Always hide after timeout, regardless of init status
    const loader = document.getElementById('loader');
    const app = document.getElementById('app');

    // Ensure loader always hides, even if there are errors
    const hideLoader = () => {
        try {
            if (loader) {
                loader.classList.add('fade-out');
                setTimeout(() => {
                    if (loader) loader.style.display = 'none';
                    if (app) {
                        app.classList.remove('hidden');
                        app.classList.add('fade-in');
                    }
                }, 800);
            }
        } catch (error) {
            console.error('Error hiding loader:', error);
            // Force hide if fade-out fails
            if (loader) loader.style.display = 'none';
            if (app) {
                app.classList.remove('hidden');
            }
        }
    };

    // Hide loader after 2.5 seconds (or immediately if DOM is ready)
    if (document.readyState === 'complete') {
        setTimeout(hideLoader, 1000);
    } else {
        setTimeout(hideLoader, 2500);
    }

    // 2. Authentication Modals
    const loginModal = document.getElementById('login-modal');
    const signupModal = document.getElementById('signup-modal');
    const loginBtn = document.getElementById('login-btn');
    const signupBtn = document.getElementById('signup-btn');
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const switchToSignup = document.getElementById('switch-to-signup');
    const switchToLogin = document.getElementById('switch-to-login');
    const loginError = document.getElementById('login-error');
    const signupError = document.getElementById('signup-error');

    function openModal(modal) {
        if (modal) modal.classList.add('active');
    }

    function closeModal(modal) {
        if (modal) modal.classList.remove('active');
    }

    if (loginBtn) loginBtn.addEventListener('click', () => openModal(loginModal));
    if (signupBtn) signupBtn.addEventListener('click', () => openModal(signupModal));
    if (switchToSignup) switchToSignup.addEventListener('click', (e) => {
        e.preventDefault();
        closeModal(loginModal);
        openModal(signupModal);
    });
    if (switchToLogin) switchToLogin.addEventListener('click', (e) => {
        e.preventDefault();
        closeModal(signupModal);
        openModal(loginModal);
    });

    // Close modals on backdrop click
    [loginModal, signupModal].forEach(modal => {
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal(modal);
            });
        }
    });

    // Login Form Handler
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideError(loginError);

            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;

            try {
                const data = await login(email, password);
                closeModal(loginModal);
                updateUIForAuthState(true);
                await window.loadHistory();

                // Check for shared story after login
                const pendingSharedStoryId = localStorage.getItem('pendingSharedStoryId');
                if (pendingSharedStoryId) {
                    localStorage.removeItem('pendingSharedStoryId');
                    try {
                        // Try authenticated endpoint first, fallback to public
                        try {
                            await loadStory(parseInt(pendingSharedStoryId, 10), false);
                        } catch (authError) {
                            // If auth fails, try public endpoint
                            await loadStory(parseInt(pendingSharedStoryId, 10), true);
                        }
                    } catch (error) {
                        console.error('Error loading shared story after login:', error);
                        showToast('Could not load shared story. It may be private or deleted.', 'error', 5000);
                    }
                }

                // Clear any error messages
                hideError(loginError);
            } catch (error) {
                showError(loginError, error.message || 'Login failed');
            }
        });
    }

    // Signup Form Handler
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideError(signupError);

            const username = document.getElementById('signup-username').value;
            const email = document.getElementById('signup-email').value;
            const password = document.getElementById('signup-password').value;

            try {
                const data = await signup(username, email, password);
                closeModal(signupModal);
                updateUIForAuthState(true);
                await window.loadHistory();
                // Clear any error messages
                hideError(signupError);
            } catch (error) {
                showError(signupError, error.message || 'Signup failed');
            }
        });
    }

    // 3. Upgrade Modal
    const upgradeModal = document.getElementById('upgrade-modal');
    const upgradeBtn = document.querySelector('.upgrade-btn');
    const closeUpgradeModal = document.getElementById('close-upgrade-modal');

    if (upgradeBtn) {
        upgradeBtn.addEventListener('click', () => openModal(upgradeModal));
    }
    if (closeUpgradeModal) {
        closeUpgradeModal.addEventListener('click', () => closeModal(upgradeModal));
    }
    if (upgradeModal) {
        upgradeModal.addEventListener('click', (e) => {
            if (e.target === upgradeModal) closeModal(upgradeModal);
        });
    }

    // 4. Interaction State Logic
    const inputArea = document.getElementById('interaction-area');
    const sendBtn = document.getElementById('send-btn');
    const mainInput = document.getElementById('main-input');
    const chatFeed = document.getElementById('chat-feed');
    const promptInstruction = document.querySelector('.prompt-instruction');
    const sidebar = document.getElementById('sidebar');

    const uploadModal = document.getElementById('upload-modal');
    const uploadBtn = document.querySelector('.upload-btn');
    const closeModalBtn = document.getElementById('close-modal');
    const dropzone = document.getElementById('dropzone');
    const filePreviewArea = document.getElementById('file-preview-area');
    const fileInput = document.getElementById('file-upload-input');

    let isFirstInteraction = true;
    // activeKebabBtn is global (defined at top of file)

    // Auto-resize textarea logic
    if (mainInput) {
        // Set initial state
        mainInput.style.overflowY = 'hidden';
        mainInput.style.height = 'auto'; // Let CSS define initial height (approx 3 lines) or defaults

        mainInput.addEventListener('input', function () {
            // Reset height to auto to correctly calculate shrink
            this.style.height = 'auto';

            // Calculate max height for 5 lines (approx 24px per line * 5 = 120px + padding)
            // Assuming simplified line-height logic, we cap at ~130px
            const maxHeight = 130;

            if (this.scrollHeight > maxHeight) {
                this.style.height = maxHeight + 'px';
                this.style.overflowY = 'auto';
            } else {
                this.style.height = this.scrollHeight + 'px';
                this.style.overflowY = 'hidden';
            }
        });
    }

    // Check if user is logged in before allowing interaction
    function checkAuthBeforeAction() {
        if (!authToken || !currentUser) {
            openModal(loginModal);
            return false;
        }
        return true;
    }

    // --- File Upload Modal Logic ---
    if (uploadBtn) uploadBtn.addEventListener('click', () => {
        if (checkAuthBeforeAction()) {
            openModal(uploadModal);
        }
    });
    if (closeModalBtn) closeModalBtn.addEventListener('click', () => uploadModal.classList.remove('active'));
    if (uploadModal) uploadModal.addEventListener('click', (e) => {
        if (e.target === uploadModal) uploadModal.classList.remove('active');
    });

    // File Upload Handlers
    if (dropzone && fileInput) {
        dropzone.addEventListener('click', () => {
            if (checkAuthBeforeAction()) {
                fileInput.click();
            }
        });

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = 'var(--text-primary)';
        });
        dropzone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = 'var(--border-light)';
        });
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = 'var(--text-primary)';
            if (e.dataTransfer.files.length > 0) {
                if (checkAuthBeforeAction()) {
                    const files = Array.from(e.dataTransfer.files);
                    const validFiles = files.filter(file => {
                        const ext = '.' + file.name.split('.').pop().toLowerCase();
                        return ['.pdf', '.docx', '.txt'].includes(ext);
                    });

                    if (validFiles.length > 0) {
                        handleFiles(validFiles);
                    } else {
                        showToast('Only .pdf, .docx, and .txt files are supported.', 'error');
                    }
                }
            }
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (fileInput.files.length > 0) {
                if (checkAuthBeforeAction()) {
                    const files = Array.from(fileInput.files);
                    const validFiles = files.filter(file => {
                        const ext = '.' + file.name.split('.').pop().toLowerCase();
                        return ['.pdf', '.docx', '.txt'].includes(ext);
                    });

                    if (validFiles.length > 0) {
                        handleFiles(validFiles);
                    } else {
                        // Reset input so user can try again
                        fileInput.value = '';
                        showToast('Only .pdf, .docx, and .txt files are supported.', 'error');
                    }
                }
            }
        });
    }

    // Store uploaded file data
    let uploadedFileData = null;

    async function handleFiles(files) {
        const file = files[0];
        if (!file) return;

        // Show loading state
        const chip = addFilePreview(file.name, true);

        try {
            // Create FormData for file upload
            const formData = new FormData();
            formData.append('file', file);

            // Upload file to server
            const response = await fetch(`${API_BASE_URL}/api/upload-file`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`
                },
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: 'Upload failed' }));
                throw new Error(errorData.detail || 'File upload failed');
            }

            const data = await response.json();

            // Store extracted text for use in story generation
            uploadedFileData = {
                filename: data.filename,
                extracted_text: data.extracted_text,
                file_type: data.file_type
            };

            // Update chip to show success
            updateFilePreviewChip(chip, file.name, false);

            // Show success message
            showToast(`File processed: ${data.text_length} characters extracted`, 'success', 3000);

            // Close modal
            setTimeout(() => {
                uploadModal.classList.remove('active');
                if (dropzone) dropzone.style.borderColor = 'var(--border-light)';
            }, 500);

        } catch (error) {
            console.error('File upload error:', error);
            showToast(`Upload failed: ${error.message}`, 'error', 5000);
            // Remove failed chip
            if (chip && chip.parentNode) {
                chip.remove();
            }
            // Clear file data
            uploadedFileData = null;
        }
    }

    function addFilePreview(name, isLoading = false) {
        if (filePreviewArea) {
            filePreviewArea.classList.remove('hidden');
            const chip = document.createElement('div');
            chip.className = 'file-preview-chip';
            chip.setAttribute('data-filename', name);

            if (isLoading) {
                chip.innerHTML = `
                    <div class="file-preview-icon">DOC</div>
                    <div class="file-preview-name">${name}</div>
                    <div class="file-preview-status" style="font-size: 0.75rem; color: var(--text-muted);">Uploading...</div>
                    <button class="file-preview-close" onclick="removeUploadedFile(this)" style="opacity: 0.5;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                `;
            } else {
                chip.innerHTML = `
                    <div class="file-preview-icon">DOC</div>
                    <div class="file-preview-name">${name}</div>
                    <button class="file-preview-close" onclick="removeUploadedFile(this)">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                `;
            }

            filePreviewArea.appendChild(chip);
            return chip;
        }
        return null;
    }

    function updateFilePreviewChip(chip, name, isLoading) {
        if (!chip) return;
        if (isLoading) {
            const statusEl = chip.querySelector('.file-preview-status');
            if (statusEl) statusEl.textContent = 'Uploading...';
        } else {
            const statusEl = chip.querySelector('.file-preview-status');
            if (statusEl) statusEl.remove();
            const closeBtn = chip.querySelector('.file-preview-close');
            if (closeBtn) closeBtn.style.opacity = '1';
        }
    }

    // Global function to remove uploaded file
    window.removeUploadedFile = function (button) {
        const chip = button.closest('.file-preview-chip');
        if (chip) {
            chip.remove();
            uploadedFileData = null;
            // Hide preview area if empty
            if (filePreviewArea && filePreviewArea.children.length === 0) {
                filePreviewArea.classList.add('hidden');
            }
        }
    };

    // --- Suggestions Modal Logic ---
    const suggestionsModal = document.getElementById('suggestions-modal');
    const suggestionsBtn = document.getElementById('suggestions-btn');
    const closeSuggestionsModal = document.getElementById('close-suggestions-modal');
    const suggestionsList = document.getElementById('suggestions-list');

    // Load suggestions from JSON and display in modal
    const allowedExtensions = ['.pdf', '.docx', '.txt'];
    // Auto-hide backend error overlay when connection is restored
    setInterval(async () => {
        const errorOverlay = document.getElementById('error-overlay');
        // Only check if overlay is visible
        if (errorOverlay && !errorOverlay.classList.contains('hidden')) {
            try {
                const response = await fetch(`${API_BASE_URL}/api/health`);
                if (response.ok) {
                    errorOverlay.classList.add('hidden');
                    // Optional: Reload history once reconnected
                    if (window.loadHistory) window.loadHistory();
                }
            } catch (e) {
                // Still offline, do nothing
            }
        }
    }, 5000);

    // Initialize application
    async function init() {
        // Check backend connection (non-blocking with timeout)
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch(`${API_BASE_URL}/api/health`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            if (!response.ok) throw new Error('Backend unhealthy');
            console.log('Backend connection successful');
        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn('Backend health check timed out (non-critical)');
            } else {
                console.warn('Backend health check failed (non-critical):', error.message);
            }
            // Don't block app loading - backend might be starting up
            // The app will show errors when actual API calls are made
        }
    }

    // Call init to check connection (don't await - non-blocking)
    init().catch(err => console.warn('Init error (non-critical):', err));
    async function loadSuggestions() {
        try {
            const response = await fetch(`${API_BASE_URL}/suggestion/info.json`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                cache: 'no-cache'
            });
            if (!response.ok) {
                console.warn(`Failed to load suggestions: ${response.status} ${response.statusText}`);
                suggestionsList.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 40px;">Suggestions are temporarily unavailable. You can still create your own story!</div>';
                return;
            }
            const suggestionsData = await response.json();

            // Also load story text files
            const storyTextPromises = [];
            for (let i = 1; i <= 4; i++) {
                storyTextPromises.push(
                    fetch(`${API_BASE_URL}/suggestion/story${i}.txt`)
                        .then(r => r.ok ? r.text() : '')
                        .catch(() => '')
                );
            }
            const storyTexts = await Promise.all(storyTextPromises);

            suggestionsList.innerHTML = '';

            Object.keys(suggestionsData).forEach((key, index) => {
                const suggestion = suggestionsData[key];
                const storyText = storyTexts[index] || '';
                const preview = storyText.substring(0, 200).trim() + (storyText.length > 200 ? '...' : '');

                const suggestionItem = document.createElement('div');
                suggestionItem.className = 'suggestion-item';
                suggestionItem.setAttribute('data-suggestion-id', key);
                suggestionItem.innerHTML = `
                    <div class="suggestion-prompt-text">${preview}</div>
                    <button class="suggestion-select-btn" onclick="window.selectSuggestion(${key}, event)">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M5 12h14M12 5l7 7-7 7"></path>
                        </svg>
                    </button>
                `;

                // Make entire item clickable
                suggestionItem.addEventListener('click', (e) => {
                    if (!e.target.closest('.suggestion-select-btn')) {
                        selectSuggestion(key, e);
                    }
                });

                suggestionsList.appendChild(suggestionItem);
            });
        } catch (error) {
            console.error('Error loading suggestions:', error);
            suggestionsList.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 40px;">Failed to load suggestions. Please try again later.</div>';
        }
    }

    // Handle suggestion selection
    window.selectSuggestion = async function (suggestionId, event) {
        if (event) {
            event.stopPropagation();
        }

        // Close modal
        closeModal(suggestionsModal);

        // Check auth
        if (!checkAuthBeforeAction()) return;

        try {
            // Load suggestion data
            const response = await fetch(`${API_BASE_URL}/suggestion/info.json`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                cache: 'no-cache'
            });
            if (!response.ok) {
                throw new Error(`Failed to load suggestion: ${response.status}`);
            }
            const suggestionsData = await response.json();
            const suggestion = suggestionsData[suggestionId];

            if (!suggestion) {
                throw new Error('Suggestion not found');
            }

            // Load story text
            const storyNum = suggestionId;
            const textResponse = await fetch(`${API_BASE_URL}/suggestion/story${storyNum}.txt`);
            const storyText = await textResponse.ok ? await textResponse.text() : '';

            // Transition to chat mode if first interaction
            if (isFirstInteraction) {
                transitionToChatMode();
                isFirstInteraction = false;
            }

            // Add user message bubble - show complete prompt for suggestions
            addBubble('user', storyText.trim());

            // Show loading states
            const loadingMessages = [
                'Analyzing story structure...',
                'Extracting key scenes...',
                'Loading scenes and images...',
                'Preparing story presentation...'
            ];
            let messageIndex = 0;
            const loadingBubble = document.createElement('div');
            loadingBubble.className = 'bubble-wrap ai loading-indicator';
            loadingBubble.innerHTML = `
                <div class="typing-status">
                    <div class="loading-message">${loadingMessages[0]}</div>
                    <div class="loading-dots">
                        <span></span><span></span><span></span>
                    </div>
                </div>
            `;
            chatFeed.appendChild(loadingBubble);
            chatFeed.scrollTop = chatFeed.scrollHeight;

            const loadingInterval = setInterval(() => {
                messageIndex = (messageIndex + 1) % loadingMessages.length;
                const messageEl = loadingBubble.querySelector('.loading-message');
                if (messageEl) {
                    messageEl.textContent = loadingMessages[messageIndex];
                }
            }, 2000);

            // Simulate loading delay for better UX
            await new Promise(resolve => setTimeout(resolve, 2500));

            clearInterval(loadingInterval);

            // Transform suggestion data to match storyData format
            const storyData = {
                story_id: `suggestion_${suggestionId}`, // Use prefix to identify suggestions
                title: suggestion.title,
                original_title: suggestion.title,
                genre: suggestion.genre,
                style: suggestion.style,
                user_prompt: storyText.trim(),
                scenes: suggestion.scenes.map((scene, idx) => ({
                    scene_number: idx + 1,
                    scene_text: scene.text,
                    cinematic_prompt: scene.text, // Use scene text as prompt
                    image_url: scene.url, // Use URL from JSON
                    image_path: null
                })),
                summary: `${suggestion.genre} story in ${suggestion.style} style`,
                total_scenes: suggestion.scenes.length,
                status: 'completed',
                created_at: new Date().toISOString()
            };

            // Update context title
            const contextTitle = document.getElementById('context-title');
            if (contextTitle && storyData.title) {
                contextTitle.textContent = storyData.title;
            }

            // Remove loading indicator
            if (loadingBubble && loadingBubble.parentNode) {
                loadingBubble.remove();
            }

            // Display the story using existing render function
            renderStoryScenes(storyData);

            // Explicitly trigger text scaling for suggestions after a short delay
            // This ensures logic from renderStoryScenes has time to mount, then we double-check fit
            setTimeout(() => {
                const bookWrap = document.querySelector(`.book-container-wrap[data-story-id="${storyData.story_id}"]`);
                if (bookWrap) {
                    const contentArea = bookWrap.querySelector(`#book-content-area-${storyData.story_id}`);
                    if (contentArea && window.fitTextToContainer) {
                        window.fitTextToContainer(contentArea);
                    }
                }
            }, 300);

        } catch (error) {
            console.error('Error loading suggestion:', error);
            showToast('Failed to load suggestion. Please try again.', 'error');
        }
    };

    // Open suggestions modal
    if (suggestionsBtn) {
        suggestionsBtn.addEventListener('click', () => {
            loadSuggestions();
            openModal(suggestionsModal);
        });
    }

    // Close suggestions modal
    if (closeSuggestionsModal) {
        closeSuggestionsModal.addEventListener('click', () => closeModal(suggestionsModal));
    }
    if (suggestionsModal) {
        suggestionsModal.addEventListener('click', (e) => {
            if (e.target === suggestionsModal) closeModal(suggestionsModal);
        });
    }

    // --- Sidebar Search Functionality ---
    const sidebarSearch = document.querySelector('.sidebar-search');
    const searchInput = document.querySelector('.sidebar-search-input');

    if (sidebarSearch) {
        sidebarSearch.addEventListener('click', () => {
            if (sidebar.classList.contains('collapsed')) {
                sidebar.classList.remove('collapsed');
                setTimeout(() => {
                    const input = sidebarSearch.querySelector('input');
                    if (input) input.focus();
                }, 300);
            }
        });
    }

    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim().toLowerCase();

            searchTimeout = setTimeout(() => {
                if (query.length === 0) {
                    window.loadHistory();
                    return;
                }

                // Filter history items
                const historyItems = document.querySelectorAll('.history-item-wrap');
                historyItems.forEach(item => {
                    const title = item.querySelector('.history-item')?.textContent.toLowerCase() || '';
                    if (title.includes(query)) {
                        item.style.display = '';
                    } else {
                        item.style.display = 'none';
                    }
                });
            }, 300);
        });
    }

    // --- Global Kebab Menu Logic ---
    const globalMenu = document.createElement('div');
    globalMenu.className = 'global-context-menu hidden';
    globalMenu.innerHTML = `
        <div class="menu-item" onclick="window.shareStory()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
                <polyline points="16 6 12 2 8 6"></polyline>
                <line x1="12" y1="2" x2="12" y2="15"></line>
            </svg>
            <span>Share</span>
        </div>
        <div class="menu-item" onclick="window.renameStory()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            <span>Rename</span>
        </div>
        <div class="menu-item delete" onclick="window.deleteStory()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            <span>Delete</span>
        </div>
    `;
    document.body.appendChild(globalMenu);

    document.addEventListener('click', (e) => {
        const kebabBtn = e.target.closest('.kebab-btn');
        if (kebabBtn) {
            e.stopPropagation();
            if (activeKebabBtn === kebabBtn && !globalMenu.classList.contains('hidden')) {
                closeGlobalMenu();
                return;
            }
            if (activeKebabBtn) {
                const prevWrap = activeKebabBtn.closest('.history-item-wrap');
                if (prevWrap) prevWrap.classList.remove('active-context');
            }
            activeKebabBtn = kebabBtn;
            const wrap = kebabBtn.closest('.history-item-wrap');
            if (wrap) wrap.classList.add('active-context');
            const rect = kebabBtn.getBoundingClientRect();
            let topInfo = rect.top;
            let leftInfo = rect.right + 10;
            if (leftInfo + 150 > window.innerWidth) leftInfo = rect.left - 160;
            if (topInfo + 100 > window.innerHeight) topInfo = window.innerHeight - 110;
            globalMenu.style.top = `${topInfo}px`;
            globalMenu.style.left = `${leftInfo}px`;
            globalMenu.classList.remove('hidden');
            return;
        }
        if (!e.target.closest('.global-context-menu')) {
            closeGlobalMenu();
        }
        if (document.getElementById('style-menu') && !e.target.closest('#style-trigger')) {
            document.getElementById('style-menu').classList.add('hidden');
        }
    });

    window.closeGlobalMenu = function () {
        globalMenu.classList.add('hidden');
        if (activeKebabBtn) {
            const wrap = activeKebabBtn.closest('.history-item-wrap');
            if (wrap) wrap.classList.remove('active-context');
            activeKebabBtn = null;
        }
    };

    // --- Style Dropdown Logic ---
    const styleTrigger = document.getElementById('style-trigger');
    const styleMenu = document.getElementById('style-menu');
    const currentStyleLabel = document.getElementById('current-style-label');

    if (styleTrigger && styleMenu) {
        styleTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            styleMenu.classList.toggle('hidden');
        });

        document.querySelectorAll('.style-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const style = opt.getAttribute('data-value');
                currentStyleLabel.textContent = style;
                styleMenu.classList.add('hidden');
            });
        });
    }

    // --- Send Button Handler ---
    if (sendBtn) {
        sendBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleSend(e);
            return false;
        });
    }
    if (mainInput) {
        mainInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                handleSend(e);
                return false;
            }
        });
    }

    async function handleSend(e) {
        // Prevent any form submission or page reload
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        // Prevent multiple simultaneous generations
        if (isGeneratingStory) {
            console.warn('Story generation already in progress, ignoring duplicate request');
            return false;
        }

        if (!checkAuthBeforeAction()) return false;

        const text = mainInput.value.trim();
        if (!text && document.querySelector('.file-preview-chip') === null) return false;

        // Check if a story already exists in current conversation
        if (currentStoryId) {
            // Show custom modal for one story per conversation
            const choice = await showStoryLimitModal();

            if (choice === 'new') {
                // Clear current story and start fresh
                currentStoryId = null;
                chatFeed.innerHTML = '';
                if (inputArea) {
                    inputArea.classList.remove('bottom-state');
                    inputArea.classList.add('center-state');
                }
                if (promptInstruction) {
                    promptInstruction.style.opacity = '1';
                    promptInstruction.style.display = 'block';
                }
                isFirstInteraction = true;
                // Continue with generation
            } else if (choice === 'upgrade') {
                // Open upgrade modal
                openModal(document.getElementById('upgrade-modal'));
                return false;
            } else {
                // User cancelled
                return false;
            }
        }

        // Set flag to prevent reloads
        isGeneratingStory = true;
        console.log('=== STORY GENERATION STARTED ===');

        // Prevent page unload during generation
        const preventUnloadHandler = (e) => {
            e.preventDefault();
            e.returnValue = 'Story generation in progress. Are you sure you want to leave?';
            return e.returnValue;
        };
        window.addEventListener('beforeunload', preventUnloadHandler);

        // Cleanup function - defined here so it's accessible in both try and catch
        const cleanup = () => {
            isGeneratingStory = false;
            window.removeEventListener('beforeunload', preventUnloadHandler);
            console.log('=== STORY GENERATION COMPLETED ===');
        };

        let loadingBubble = null;
        let loadingInterval = null;

        try {
            if (isFirstInteraction) {
                transitionToChatMode();
                isFirstInteraction = false;
            }

            // Client-side validation
            if (!text || text.trim().length < 10) {
                showToast('Story prompt must be at least 10 characters long.', 'error', 4000);
                addBubble('ai', 'That prompt is a bit too short. Please provide more details (at least 10 characters) to help me generate a good story.');
                cleanup();
                return;
            }


            let userContent = text;
            let promptText = text;

            // Include extracted text from uploaded file if available
            if (uploadedFileData && uploadedFileData.extracted_text) {
                // Combine file content with user prompt
                promptText = `${uploadedFileData.extracted_text}\n\nUser request: ${text}`;

                // Show text snippet in the bubble for context (first 300 chars)
                const snippet = uploadedFileData.extracted_text.substring(0, 300) + (uploadedFileData.extracted_text.length > 300 ? '...' : '');

                // Display exactly what the user will see later (extracted text + their prompt)
                userContent = `<strong>[File: ${uploadedFileData.filename}]</strong><br>
                               <div class="extracted-text-preview" style="font-size: 0.9em; opacity: 0.8; margin: 8px 0; padding-left: 8px; border-left: 2px solid var(--accent-light);">
                                   ${snippet}
                               </div>` + (text || '');

                // Clear uploaded file data after use
                uploadedFileData = null;
                document.getElementById('file-preview-area').innerHTML = '';
                document.getElementById('file-preview-area').classList.add('hidden');
            } else {
                // Check for old file chip format (backward compatibility)
                const fileChip = document.querySelector('.file-preview-chip .file-preview-name');
                if (fileChip) {
                    userContent = `[File: ${fileChip.textContent}] <br>` + text;
                    document.getElementById('file-preview-area').innerHTML = '';
                    document.getElementById('file-preview-area').classList.add('hidden');
                }
            }

            addBubble('user', userContent || "Analyzing document...");
            mainInput.value = '';
            // Reset input size
            if (mainInput) {
                mainInput.style.height = 'auto'; // Reset to default/auto height
                mainInput.style.overflowY = 'hidden'; // Restore hidden overflow
            }

            // Call API to generate scenes
            const style = currentStyleLabel?.textContent || 'Cinematic';

            // Show enhanced loading messages
            const loadingMessages = [
                'Analyzing story structure...',
                'Extracting key scenes...',
                'Generating cinematic prompts...',
                'Creating scene descriptions...'
            ];
            let messageIndex = 0;
            loadingBubble = document.createElement('div');
            loadingBubble.className = 'bubble-wrap ai loading-indicator';
            loadingBubble.innerHTML = `
                <div class="typing-status">
                    <div class="loading-message">${loadingMessages[0]}</div>
                    <div class="loading-dots">
                        <span></span><span></span><span></span>
                    </div>
                </div>
            `;
            chatFeed.appendChild(loadingBubble);
            chatFeed.scrollTop = chatFeed.scrollHeight;

            loadingInterval = setInterval(() => {
                messageIndex = (messageIndex + 1) % loadingMessages.length;
                const messageEl = loadingBubble.querySelector('.loading-message');
                if (messageEl) {
                    messageEl.textContent = loadingMessages[messageIndex];
                }
            }, 2000);

            const response = await makeAPICall('/api/generate-scenes', {
                method: 'POST',
                body: JSON.stringify({
                    prompt: promptText, // Use promptText which includes file content if available
                    style: style,
                    max_scenes: 5
                })
            });

            // Update loading message to indicate image generation is starting
            const messageEl = loadingBubble.querySelector('.loading-message');
            if (messageEl) {
                messageEl.textContent = 'Generating images...';
            }

            // Store current story ID immediately (clear any previous story in this conversation)
            if (response.story_id) {
                currentStoryId = response.story_id;

                // Remove active class from all history items when new story is created
                const historyList = document.getElementById('history-list');
                if (historyList) {
                    historyList.querySelectorAll('.history-item-wrap').forEach(i => {
                        i.classList.remove('active-context');
                    });
                }

                // Save to localStorage to prevent history loss on reload
                localStorage.setItem('lastStoryId', response.story_id);
                localStorage.setItem('pendingStory', JSON.stringify({
                    id: response.story_id,
                    title: response.title,
                    timestamp: Date.now()
                }));

                // Immediately update sidebar history so the new story appears in real-time
                setTimeout(() => {
                    if (window.loadHistory) window.loadHistory();
                }, 100);
            }

            // Update context title immediately
            const contextTitle = document.getElementById('context-title');
            if (contextTitle && response.title) {
                contextTitle.textContent = response.title;
            }

            // Generate images BEFORE showing the book (user wants both done before display)
            if (response.story_id) {
                try {
                    console.log('=== STARTING IMAGE GENERATION ===');
                    console.log('Story ID:', response.story_id);

                    // Update loading message
                    const messageEl = loadingBubble.querySelector('.loading-message');
                    if (messageEl) {
                        messageEl.textContent = 'Generating images... This may take a few minutes';
                    }

                    // Generate images and update response with image URLs
                    console.log('Calling /api/generate-images/' + response.story_id);
                    const imageResponse = await makeAPICall(`/api/generate-images/${response.story_id}`, {
                        method: 'POST'
                    });
                    console.log('Image generation API response:', imageResponse);

                    // Reload story to get updated image URLs
                    console.log('Fetching updated story with images...');
                    const updatedStory = await makeAPICall(`/api/story/${response.story_id}`);
                    console.log('Updated story received:', updatedStory);

                    // Update response with images from updated story
                    if (updatedStory.scenes) {
                        response.scenes = updatedStory.scenes.map((scene, idx) => ({
                            ...response.scenes[idx],
                            image_url: scene.image_url,
                            image_path: scene.image_path
                        }));
                        console.log('Updated response.scenes with images:', response.scenes);
                    }

                    // Show success message
                    if (imageResponse.rate_limited) {
                        showToast(
                            `Rate limit reached. Generated ${imageResponse.completed}/${imageResponse.total} images.`,
                            'warning',
                            6000
                        );
                    } else if (imageResponse.partial) {
                        showToast(
                            imageResponse.message || `Generated ${imageResponse.completed || imageResponse.image_urls?.length || 0} images. Some failed.`,
                            'info',
                            6000
                        );
                    } else {
                        showToast('Images generated successfully!', 'success', 4000);
                    }
                    console.log('=== IMAGE GENERATION COMPLETED ===');
                } catch (imgError) {
                    console.error('=== IMAGE GENERATION ERROR ===');
                    console.error('Error details:', imgError);
                    console.error('Error message:', imgError.message);
                    console.error('Error stack:', imgError.stack);
                    // Continue to show scenes even if image generation fails
                    showToast('Scenes generated, but image generation failed: ' + (imgError.message || 'Unknown error'), 'warning', 8000);
                }
            } else {
                console.warn('No story_id in response, skipping image generation');
            }

            // Remove loading bubble
            clearInterval(loadingInterval);
            loadingBubble.remove();
            loadingBubble = null; // Prevent double removal

            // Display the generated scenes with images (after both are done)
            renderStoryScenes(response);

            // Update history in background (non-blocking, smooth experience)
            // Only update if not already loading and not generating
            if (!isLoadingHistory && !isGeneratingStory) {
                window.loadHistory().catch(err => {
                    console.warn('Background history update failed:', err);
                });
            }

            // Update timestamp to prevent visibilitychange from reloading
            if (window.lastHistoryUpdate !== undefined) {
                window.lastHistoryUpdate = Date.now();
            }

            // Clear the generation flag
            cleanup();
        } catch (error) {
            // Clear the generation flag on error too
            cleanup();
            if (loadingInterval) clearInterval(loadingInterval);
            if (loadingBubble && loadingBubble.parentNode) loadingBubble.remove();

            console.error('=== STORY GENERATION ERROR ===');
            console.error('Error details:', error);

            let errorMsg = error.message || 'Failed to generate scenes. Please try again.';

            // Check for quota/rate limit errors
            if (errorMsg.includes('quota') || errorMsg.includes('429') || errorMsg.includes('rate limit')) {
                errorMsg = 'API quota exceeded. Your story may have been saved. Please check your history or try again later.';
                // Try to reload history in case story was partially saved
                setTimeout(() => {
                    window.loadHistory().catch(err => console.warn('History reload failed:', err));
                }, 1000);
            }

            showToast(errorMsg, 'error', 6000);

            addBubble('ai', `Error: ${errorMsg}`);
        }

        // Prevent any default behavior
        return false;
    }

    // Prevent page reload during story generation
    window.addEventListener('beforeunload', (e) => {
        if (isGeneratingStory) {
            e.preventDefault();
            e.returnValue = 'Story generation in progress. Are you sure you want to leave?';
            return e.returnValue;
        }
    });

    function transitionToChatMode() {
        inputArea.classList.remove('center-state');
        inputArea.classList.add('bottom-state');
        if (promptInstruction) {
            promptInstruction.style.opacity = '0';
            setTimeout(() => promptInstruction.style.display = 'none', 500);
        }
        if (sidebar) sidebar.classList.add('collapsed');
    }

    function addBubble(type, content) {
        const bubbleWrap = document.createElement('div');
        bubbleWrap.className = `bubble-wrap ${type}`;

        // Removed 3-dot menu from bubbles - Archive/Delete now in top bar menu

        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        bubble.innerHTML = content;
        bubbleWrap.appendChild(bubble);
        chatFeed.appendChild(bubbleWrap);
        chatFeed.scrollTop = chatFeed.scrollHeight;
    }

    function showBubbleMenu(e, bubbleWrap) {
        // Close any existing menu
        const existingMenu = document.querySelector('.bubble-context-menu');
        if (existingMenu) existingMenu.remove();

        const menu = document.createElement('div');
        menu.className = 'bubble-context-menu';
        menu.innerHTML = `
            <div class="menu-item" onclick="archiveBubble(this)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="21 8 21 21 3 21 3 8"></polyline>
                    <rect x="1" y="3" width="22" height="5"></rect>
                    <line x1="10" y1="12" x2="14" y2="12"></line>
                </svg>
                <span>Archive</span>
            </div>
            <div class="menu-item delete" onclick="deleteBubble(this)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                <span>Delete</span>
            </div>
        `;
        document.body.appendChild(menu);

        const rect = e.target.getBoundingClientRect();
        menu.style.top = `${rect.bottom + 5}px`;
        menu.style.left = `${rect.left}px`;

        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', function closeMenu() {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            });
        }, 0);
    }

    window.archiveBubble = function (menuItem) {
        const menu = menuItem.closest('.bubble-context-menu');
        const bubbleWrap = menu?.previousElementSibling || menu?.parentElement?.querySelector('.bubble-wrap');
        if (bubbleWrap) {
            bubbleWrap.style.opacity = '0.5';
            alert('Message archived');
        }
        if (menu) menu.remove();
    };

    window.deleteBubble = function (menuItem) {
        const menu = menuItem.closest('.bubble-context-menu');
        const bubbleWrap = menu?.previousElementSibling || menu?.parentElement?.querySelector('.bubble-wrap');
        if (bubbleWrap && confirm('Delete this message?')) {
            bubbleWrap.remove();
        }
        if (menu) menu.remove();
    };

    // Helper to fit text to container
    window.fitTextToContainer = function (element, attempt = 0) {
        if (!element) return;

        // If not attached or hidden, try again briefly
        if (element.clientHeight === 0) {
            if (attempt < 5) {
                requestAnimationFrame(() => window.fitTextToContainer(element, attempt + 1));
            }
            return;
        }

        // Find the paragraph with the scene text (it's usually the <p class="scene-desc">)
        const sceneText = element.querySelector('.scene-desc');
        if (!sceneText) return;

        // Reset to default size first to measure correctly
        sceneText.style.fontSize = '1.05rem';

        const containerHeight = element.parentElement ? element.parentElement.clientHeight : 500;
        // Padding is usually around 80px top/bottom
        const maxContentHeight = containerHeight - 100;

        let currentSize = 1.05;
        const minSize = 0.7; // Don't go below this

        // Loop while content is bigger than container
        // Safety break counter
        let loops = 0;
        while (element.scrollHeight > element.clientHeight && currentSize > minSize && loops < 50) {
            currentSize -= 0.05;
            sceneText.style.fontSize = `${currentSize}rem`;
            loops++;
        }
    };

    function renderStoryScenes(storyData) {
        // Validate story data
        if (!storyData || !storyData.scenes || storyData.scenes.length === 0) {
            addBubble('ai', 'No scenes were generated. Please try again with a different prompt.');
            return;
        }

        // Remove any existing loading indicators
        const existingLoading = chatFeed.querySelector('.loading-indicator');
        if (existingLoading) {
            existingLoading.remove();
        }

        // Ensure currentStoryId is set when rendering
        if (storyData.story_id) {
            currentStoryId = storyData.story_id;
        }

        // CRITICAL: Book canvas ALWAYS uses original_title (never changes, even after renaming)
        // History list and top bar use title (can be renamed)
        // original_title is stored separately in database and never changes
        const originalTitle = storyData.original_title || storyData.title;

        // Display scenes immediately (smooth flow like ChatGPT - no artificial delay)

        const bookWrap = document.createElement('div');
        bookWrap.className = 'book-container-wrap fade-in';
        bookWrap.setAttribute('data-story-id', storyData.story_id);
        // Store storyData on the element so it can be accessed/updated later
        // IMPORTANT: Store a deep copy to preserve the original title for the book canvas
        bookWrap.storyData = JSON.parse(JSON.stringify(storyData));
        // Store the original title separately - this will NEVER change, even when renamed
        // This comes from the database original_title field
        bookWrap.originalTitle = originalTitle;
        // Store currentPageIndex on bookWrap so it persists and can be accessed in expanded view
        if (!bookWrap.currentPageIndex) {
            bookWrap.currentPageIndex = 0;
        }
        let currentPageIndex = bookWrap.currentPageIndex;

        const currentScene = storyData.scenes[currentPageIndex];
        const imageUrl = currentScene.image_url
            ? `${API_BASE_URL}${currentScene.image_url}`
            : currentScene.image_path
                ? `${API_BASE_URL}/scene_images/${currentScene.image_path.split(/[/\\]/).pop()}`
                : null;
        const imageHTML = imageUrl
            ? `<img src="${imageUrl}" alt="Scene ${currentPageIndex + 1}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.parentElement.innerHTML='<div class=\\'generated-image-placeholder\\'><div class=\\'art-overlay\\'></div><span class=\\'img-label\\'>Image not found</span></div>'">`
            : `<div class="generated-image-placeholder">
                    <div class="art-overlay"></div>
                    <span class="img-label">Scene ${currentPageIndex + 1}<br><small>Click "Generate Images" to create</small></span>
                   </div>`;

        // Create a version of storyData with the ORIGINAL title for the book canvas
        // This title will NEVER change, even if the story is renamed
        const bookCanvasData = {
            ...storyData,
            title: originalTitle  // Always use the original title, never the renamed one
        };

        bookWrap.innerHTML = `
            <div class="book-spine"></div>
            <div class="book-spread">
                    <div class="book-page left-page" id="left-page-${storyData.story_id}">
                        ${imageHTML}
                </div>
                <div class="book-page right-page">
                        <div class="page-content" id="book-content-area-${storyData.story_id}">
                           ${getPageHTML(currentScene, bookCanvasData)}
                    </div>
                    <div class="page-nav-overlay">
                            <button type="button" class="page-btn prev-btn" data-story-id="${storyData.story_id}">←</button>
                            <button type="button" class="page-btn next-btn" data-story-id="${storyData.story_id}">→</button>
                    </div>
                </div>
            </div>
            <div class="book-external-actions">
                     <button type="button" class="book-action-btn" onclick="window.expandBook('${storyData.story_id}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                        </svg>
                    Expand
                 </button>
                     <button type="button" class="book-action-btn" onclick="window.downloadPage('${storyData.story_id}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        Download
                 </button>
                     <button type="button" class="book-action-btn" onclick="window.exportBook('${storyData.story_id}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                            <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                    Export
                 </button>
            </div>
        `;

        const contentArea = bookWrap.querySelector(`#book-content-area-${storyData.story_id}`);
        const leftPage = bookWrap.querySelector(`#left-page-${storyData.story_id}`);
        const nextBtn = bookWrap.querySelector('.next-btn[data-story-id="' + storyData.story_id + '"]');
        const prevBtn = bookWrap.querySelector('.prev-btn[data-story-id="' + storyData.story_id + '"]');

        // Initial text fit
        setTimeout(() => {
            const initialContent = bookWrap.querySelector(`#book-content-area-${storyData.story_id}`);
            if (initialContent) window.fitTextToContainer(initialContent);
        }, 300);

        // Add ResizeObserver to handle sidebar toggles and window resizing
        if (window.ResizeObserver) {
            const resizeObserver = new ResizeObserver(entries => {
                for (let entry of entries) {
                    // When container size changes, re-run text fitting
                    window.fitTextToContainer(entry.target);
                }
            });
            const contentArea = bookWrap.querySelector(`#book-content-area-${storyData.story_id}`);
            if (contentArea) resizeObserver.observe(contentArea);
        }

        const updatePage = () => {
            // Use stored storyData from bookWrap, but ALWAYS use the original title for the book canvas
            const currentStoryData = bookWrap.storyData || storyData;
            // Create a copy with the ORIGINAL title - this NEVER changes, even after renaming
            // CRITICAL: bookWrap.originalTitle is set when the book is first created and NEVER changes
            const originalTitleToUse = bookWrap.originalTitle || currentStoryData.original_title || currentStoryData.title;
            const bookCanvasData = {
                ...currentStoryData,
                title: originalTitleToUse  // Always use the original title, never the renamed one
            };
            const scene = currentStoryData.scenes[currentPageIndex];
            const imageUrl = scene.image_url
                ? `${API_BASE_URL}${scene.image_url}`
                : scene.image_path
                    ? `${API_BASE_URL}/scene_images/${scene.image_path.split(/[/\\]/).pop()}`
                    : null;

            contentArea.style.opacity = '0';
            leftPage.style.opacity = '0';

            setTimeout(() => {
                // Always use the original title in the book canvas
                contentArea.innerHTML = getPageHTML(scene, bookCanvasData);

                if (imageUrl) {
                    leftPage.innerHTML = `<img src="${imageUrl}" alt="Scene ${currentPageIndex + 1}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.parentElement.innerHTML='<div class=\\'generated-image-placeholder\\'><div class=\\'art-overlay\\'></div><span class=\\'img-label\\'>Image not found</span></div>'">`;
                } else {
                    leftPage.innerHTML = `<div class="generated-image-placeholder">
                            <div class="art-overlay"></div>
                            <span class="img-label">Scene ${currentPageIndex + 1}<br><small>No image yet</small></span>
                        </div>`;
                }

                contentArea.style.opacity = '1';
                leftPage.style.opacity = '1';
                contentArea.style.opacity = '1';
                leftPage.style.opacity = '1';

                // Auto-scale text to fit
                window.fitTextToContainer(contentArea);
            }, 200);
        };

        nextBtn.addEventListener('click', () => {
            if (currentPageIndex < storyData.scenes.length - 1) {
                currentPageIndex++;
                bookWrap.currentPageIndex = currentPageIndex; // Persist to bookWrap
                updatePage();
            }
        });
        prevBtn.addEventListener('click', () => {
            if (currentPageIndex > 0) {
                currentPageIndex--;
                bookWrap.currentPageIndex = currentPageIndex; // Persist to bookWrap
                updatePage();
            }
        });

        // Explicitly reset page index to 0 when rendering logic starts
        bookWrap.currentPageIndex = 0;

        chatFeed.appendChild(bookWrap);
        chatFeed.scrollTop = chatFeed.scrollHeight;
        // Removed setTimeout delay - display immediately for smooth ChatGPT-like flow
    }

    // Make getPageHTML globally accessible so it can be used in expandBook
    window.getPageHTML = function (scene, storyData) {
        // IMPORTANT: Always use the title from storyData, which should be originalTitle
        // This function is called with bookCanvasData which has the original title
        const displayTitle = storyData.title || 'Untitled Story';
        return `
            <h3>${displayTitle}</h3>
            <p class="scene-desc">${scene.scene_text}</p>
            <div class="meta-tags">
                ${storyData.genre ? `<span class="tag">${storyData.genre}</span>` : ''}
                ${storyData.style ? `<span class="tag">${storyData.style}</span>` : ''}
            </div>
        `;
    };

    // Load History - Make it globally accessible
    window.loadHistory = async function loadHistory() {
        // Prevent concurrent history loads
        if (isLoadingHistory) return;
        isLoadingHistory = true;

        try {
            if (!authToken) {
                // Clear history if not logged in
                const historyList = document.getElementById('history-list');
                if (historyList) historyList.innerHTML = '';
                return;
            }

            const historyList = document.getElementById('history-list');
            if (!historyList) {
                console.error('History list element not found');
                // Retry once after a short delay
                setTimeout(() => { isLoadingHistory = false; window.loadHistory(); }, 500);
                return;
            }

            const stories = await makeAPICall('/api/history');
            if (!stories || stories.length === 0) {
                historyList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No stories yet</div>';
                return;
            }

            historyList.innerHTML = stories.map(story => `
                <div class="history-item-wrap" data-story-id="${story.id}">
                    <div class="history-item">${story.title.length > 20 ? story.title.substring(0, 20) + '...' : story.title}</div>
                    <div class="history-actions-kebab">
                        <button type="button" class="kebab-btn">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="1"></circle>
                                <circle cx="12" cy="5" r="1"></circle>
                                <circle cx="12" cy="19" r="1"></circle>
                            </svg>
                        </button>
                    </div>
                </div>
            `).join('');

            // Add click handlers to history items
            historyList.querySelectorAll('.history-item-wrap').forEach(item => {
                const storyId = item.getAttribute('data-story-id');
                const historyItem = item.querySelector('.history-item');
                if (historyItem) {
                    historyItem.style.cursor = 'pointer';
                    historyItem.addEventListener('click', async (e) => {
                        e.stopPropagation();

                        // Remove active class from all history items
                        historyList.querySelectorAll('.history-item-wrap').forEach(i => {
                            i.classList.remove('active-context');
                        });

                        // Add active class to selected item
                        item.classList.add('active-context');

                        await loadStory(storyId);
                    });
                }
            });

            // Highlight current story if one is loaded
            if (currentStoryId && !currentStoryId.toString().startsWith('suggestion_')) {
                const currentItem = historyList.querySelector(`.history-item-wrap[data-story-id="${currentStoryId}"]`);
                if (currentItem) {
                    currentItem.classList.add('active-context');
                }
            }
        } catch (error) {
            console.error('Failed to load history:', error);
            const historyList = document.getElementById('history-list');
            if (historyList) {
                historyList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">Failed to load history</div>';
            }
        } finally {
            // Allow subsequent loads after a small cooldown to avoid hammering
            setTimeout(() => { isLoadingHistory = false; }, 500);
        }
    }

    // Load a specific story (with optional public access for shared stories)
    async function loadStory(storyId, isPublic = false) {
        try {
            // Check if this story is already displayed - if so, don't reload it
            const existingBookWrap = document.querySelector(`[data-story-id="${storyId}"]`);
            if (existingBookWrap && currentStoryId === storyId) {
                // Story is already displayed, just scroll to top
                chatFeed.scrollTop = 0;
                return;
            }

            // Use public endpoint if not authenticated or if explicitly requested
            const endpoint = (isPublic || !authToken) ? `/api/story/${storyId}/public` : `/api/story/${storyId}`;
            const story = await makeAPICall(endpoint, { skipAuth: isPublic || !authToken });

            // Clear chat feed
            chatFeed.innerHTML = '';

            // Show original user prompt first (like ChatGPT) - this is the conversation history
            if (story.user_prompt) {
                addBubble('user', `<p>${story.user_prompt}</p>`);
            }

            // Move input to bottom state (chat mode)
            if (inputArea) {
                inputArea.classList.remove('center-state');
                inputArea.classList.add('bottom-state');
            }
            if (promptInstruction) {
                promptInstruction.style.opacity = '0';
                promptInstruction.style.display = 'none';
            }
            isFirstInteraction = false;

            // Ensure original_title exists (for old stories that might not have it)
            if (!story.original_title) {
                story.original_title = story.title;
            }

            // Display the story (AI response)
            // renderStoryScenes will use story.original_title for book canvas, story.title for top bar
            renderStoryScenes(story);

            // Scroll to top to show the conversation from beginning
            setTimeout(() => {
                chatFeed.scrollTop = 0;
            }, 200);

            // Update context title (top bar) - use title (may be renamed, that's the chat name)
            const contextTitle = document.getElementById('context-title');
            if (contextTitle) contextTitle.textContent = story.title;

            // Highlight selected story in history
            const historyList = document.getElementById('history-list');
            if (historyList && storyId && !storyId.toString().startsWith('suggestion_')) {
                // Remove active class from all history items
                historyList.querySelectorAll('.history-item-wrap').forEach(i => {
                    i.classList.remove('active-context');
                });
                // Add active class to current story
                const currentItem = historyList.querySelector(`.history-item-wrap[data-story-id="${storyId}"]`);
                if (currentItem) {
                    currentItem.classList.add('active-context');
                }
            }

            // Store current story ID for top bar menu actions
            currentStoryId = storyId;

            // Update top bar menu to show correct archive/unarchive option
            if (window.updateTopBarMenu) {
                await updateTopBarMenu();
            }
        } catch (error) {
            console.error('Failed to load story:', error);
            addBubble('ai', `Error loading story: ${error.message}`);
        }
    }

    // New Story button handler
    const newStoryBtn = document.querySelector('.nav-item.primary-action');
    if (newStoryBtn) {
        newStoryBtn.addEventListener('click', () => {
            // Clear current story
            currentStoryId = null;
            // Clear chat feed
            chatFeed.innerHTML = '';
            // Reset to center state
            if (inputArea) {
                inputArea.classList.remove('bottom-state');
                inputArea.classList.add('center-state');
            }
            if (promptInstruction) {
                promptInstruction.style.opacity = '1';
                promptInstruction.style.display = 'block';
            }
            // Clear input
            if (mainInput) mainInput.value = '';
            // Reset state
            isFirstInteraction = true;
            // Update title
            const contextTitle = document.getElementById('context-title');
            if (contextTitle) contextTitle.textContent = 'Untitled Story';

            // Clear history selection
            const historyList = document.getElementById('history-list');
            if (historyList) {
                historyList.querySelectorAll('.history-item-wrap').forEach(i => {
                    i.classList.remove('active-context');
                });
            }
        });
    }

    // Share Button Handler (Standalone button in header)
    const shareBtn = document.getElementById('share-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', () => {
            if (currentStoryId) {
                // Ensure we call shareStory with context
                window.shareStory();
            } else {
                showToast('No story to share', 'error');
            }
        });
    }


    // Sidebar Toggle
    const toggleBtn = document.getElementById('toggle-sidebar');
    if (toggleBtn) toggleBtn.addEventListener('click', () => sidebar.classList.toggle('collapsed'));

    // Top bar story menu (Archive and Delete)
    const moreActionsBtn = document.querySelector('.more-actions');
    const topBarMenu = document.createElement('div');
    topBarMenu.className = 'global-context-menu hidden';
    topBarMenu.id = 'top-bar-story-menu';
    topBarMenu.innerHTML = `
        <div class="menu-item" onclick="window.archiveCurrentStory()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="21 8 21 21 3 21 3 8"></polyline>
                <rect x="1" y="3" width="22" height="5"></rect>
                <line x1="10" y1="12" x2="14" y2="12"></line>
            </svg>
            <span>Archive</span>
        </div>
        <div class="menu-item delete" onclick="window.deleteCurrentStory()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            <span>Delete</span>
        </div>
    `;
    document.body.appendChild(topBarMenu);

    // Function to update top bar menu based on story archive status
    async function updateTopBarMenu() {
        if (!currentStoryId) {
            topBarMenu.innerHTML = `
                <div class="menu-item" onclick="window.archiveCurrentStory()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="21 8 21 21 3 21 3 8"></polyline>
                        <rect x="1" y="3" width="22" height="5"></rect>
                        <line x1="10" y1="12" x2="14" y2="12"></line>
                    </svg>
                    <span>Archive</span>
                </div>
                <div class="menu-item delete" onclick="window.deleteCurrentStory()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    <span>Delete</span>
                </div>
            `;
            return;
        }

        try {
            const story = await makeAPICall(`/api/story/${currentStoryId}`);
            const isArchived = story.archived === 1 || story.archived === true;

            if (isArchived) {
                topBarMenu.innerHTML = `
                    <div class="menu-item" onclick="window.unarchiveCurrentStory()">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="21 8 21 21 3 21 3 8"></polyline>
                            <rect x="1" y="3" width="22" height="5"></rect>
                            <line x1="10" y1="12" x2="14" y2="12"></line>
                        </svg>
                        <span>Unarchive</span>
                    </div>
                    <div class="menu-item delete" onclick="window.deleteCurrentStory()">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        <span>Delete</span>
                    </div>
                `;
            } else {
                topBarMenu.innerHTML = `
                    <div class="menu-item" onclick="window.archiveCurrentStory()">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="21 8 21 21 3 21 3 8"></polyline>
                            <rect x="1" y="3" width="22" height="5"></rect>
                            <line x1="10" y1="12" x2="14" y2="12"></line>
                        </svg>
                        <span>Archive</span>
                    </div>
                    <div class="menu-item delete" onclick="window.deleteCurrentStory()">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        <span>Delete</span>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error checking story archive status:', error);
            // Default to archive menu
            topBarMenu.innerHTML = `
                <div class="menu-item" onclick="window.archiveCurrentStory()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="21 8 21 21 3 21 3 8"></polyline>
                        <rect x="1" y="3" width="22" height="5"></rect>
                        <line x1="10" y1="12" x2="14" y2="12"></line>
                    </svg>
                    <span>Archive</span>
                </div>
                <div class="menu-item delete" onclick="window.deleteCurrentStory()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    <span>Delete</span>
                </div>
            `;
        }
    }

    if (moreActionsBtn) {
        moreActionsBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            // Only show menu if a story is currently loaded
            if (currentStoryId) {
                await updateTopBarMenu();
                const rect = moreActionsBtn.getBoundingClientRect();
                topBarMenu.style.top = `${rect.bottom + 5}px`;
                topBarMenu.style.right = `${window.innerWidth - rect.right}px`;
                topBarMenu.classList.remove('hidden');
            } else {
                showToast('No story loaded', 'info', 2000);
            }
        });
    }

    // Close top bar menu on outside click
    document.addEventListener('click', (e) => {
        if (!moreActionsBtn?.contains(e.target) && !topBarMenu.contains(e.target)) {
            topBarMenu.classList.add('hidden');
        }
    });

    // Archive current story function
    window.archiveCurrentStory = async function () {
        topBarMenu.classList.add('hidden');
        if (!currentStoryId) {
            showToast('No story to archive', 'error');
            return;
        }

        try {
            await makeAPICall(`/api/story/${currentStoryId}/archive`, {
                method: 'POST'
            });

            // Remove story from display if currently shown
            const storyWrap = document.querySelector(`[data-story-id="${currentStoryId}"]`);
            if (storyWrap) {
                storyWrap.style.transition = 'opacity 0.3s ease-out';
                storyWrap.style.opacity = '0';
                setTimeout(() => storyWrap.remove(), 300);
            }

            // Clear current story view
            if (currentStoryId === parseInt(currentStoryId)) {
                chatFeed.innerHTML = '';
                currentStoryId = null;
                // Reset UI to center
                if (inputArea) {
                    inputArea.classList.remove('bottom-state');
                    inputArea.classList.add('center-state');
                }
                if (promptInstruction) {
                    promptInstruction.style.opacity = '1';
                    promptInstruction.style.display = 'block';
                }
                isFirstInteraction = true;
                const contextTitle = document.getElementById('context-title');
                if (contextTitle) contextTitle.textContent = 'Untitled Story';
            }

            // Reload history to remove archived story from list
            if (window.loadHistory) await window.loadHistory();

            showToast('Story archived successfully', 'success');
        } catch (error) {
            console.error('Error archiving story:', error);
            showToast(`Failed to archive story: ${error.message}`, 'error', 6000);
        }
    };

    // Unarchive current story function
    window.unarchiveCurrentStory = async function () {
        topBarMenu.classList.add('hidden');
        if (!currentStoryId) {
            showToast('No story to unarchive', 'error');
            return;
        }

        try {
            await makeAPICall(`/api/story/${currentStoryId}/unarchive`, {
                method: 'POST'
            });

            // Reload history to show unarchived story
            if (window.loadHistory) await window.loadHistory();

            showToast('Story unarchived successfully', 'success');
        } catch (error) {
            console.error('Error unarchiving story:', error);
            showToast(`Failed to unarchive story: ${error.message}`, 'error', 6000);
        }
    };

    // Delete current story function
    window.deleteCurrentStory = async function () {
        topBarMenu.classList.add('hidden');
        if (!currentStoryId) {
            showToast('No story to delete', 'error');
            return;
        }

        const confirmed = await showConfirmModal(
            'Delete Story',
            'Are you sure you want to delete this story? This action cannot be undone.'
        );

        if (confirmed) {
            try {
                // Save id before nulling state
                const deletedStoryId = currentStoryId;

                await makeAPICall(`/api/story/${deletedStoryId}`, { method: 'DELETE' });

                // Remove the element from DOM immediately - smooth removal with fade out
                const storyWrap = document.querySelector(`[data-story-id="${deletedStoryId}"]`);
                if (storyWrap) {
                    storyWrap.style.transition = 'opacity 0.3s ease-out';
                    storyWrap.style.opacity = '0';
                    setTimeout(() => storyWrap.remove(), 300);
                }

                // Clear the current story view if it was the one deleted
                if (currentStoryId === deletedStoryId) {
                    chatFeed.innerHTML = '';
                    currentStoryId = null;
                    // Reset UI to center
                    if (inputArea) {
                        inputArea.classList.remove('bottom-state');
                        inputArea.classList.add('center-state');
                    }
                    if (promptInstruction) {
                        promptInstruction.style.opacity = '1';
                        promptInstruction.style.display = 'block';
                    }
                    isFirstInteraction = true;
                    const contextTitle = document.getElementById('context-title');
                    if (contextTitle) contextTitle.textContent = 'Untitled Story';
                }

                // Update history timestamp to avoid immediate visibility-change reloads
                if (window.lastHistoryUpdate !== undefined) {
                    window.lastHistoryUpdate = Date.now();
                }

                // Reload history (single guarded call)
                if (window.loadHistory) await window.loadHistory();

                showToast('Story deleted successfully', 'success');
            } catch (error) {
                console.error('Error deleting story:', error);
                let errorMsg = error.message || 'Unknown error';
                showToast(`Failed to delete story: ${errorMsg}`, 'error', 6000);
            }
        }
    };

    // User dropdown menu
    const userInfoClickable = document.getElementById('user-info-clickable');
    const userDropdown = document.getElementById('user-dropdown');
    const settingsOption = document.getElementById('settings-option');
    const logoutOption = document.getElementById('logout-option');

    if (userInfoClickable && userDropdown) {
        userInfoClickable.style.cursor = 'pointer';
        userInfoClickable.addEventListener('click', (e) => {
            e.stopPropagation();
            userDropdown.classList.toggle('hidden');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!userInfoClickable.contains(e.target) && !userDropdown.contains(e.target)) {
                userDropdown.classList.add('hidden');
            }
        });

        // Settings option
        const settingsModal = document.getElementById('settings-modal');
        const closeSettingsModal = document.getElementById('close-settings-modal');
        const saveSettingsBtn = document.getElementById('save-settings-btn');
        const settingsUsername = document.getElementById('settings-username');
        const settingsEmail = document.getElementById('settings-email');
        const settingsPassword = document.getElementById('settings-password');
        const settingsPlan = document.getElementById('settings-plan');
        const editUsernameBtn = document.getElementById('edit-username-btn');
        const exportDataBtn = document.getElementById('export-data-btn');
        const clearCacheBtn = document.getElementById('clear-cache-btn');
        let isEditingUsername = false;
        let originalUsername = '';

        function openSettingsModal() {
            if (settingsModal) {
                // Load current user data
                if (currentUser) {
                    originalUsername = currentUser.username || '';
                    if (settingsUsername) {
                        settingsUsername.value = originalUsername;
                        settingsUsername.readOnly = true;
                    }
                    if (settingsEmail) settingsEmail.value = currentUser.email || '';
                    if (settingsPlan) settingsPlan.value = currentUser.plan || 'Free';
                }

                isEditingUsername = false;
                if (editUsernameBtn) {
                    editUsernameBtn.style.display = 'flex';
                }

                settingsModal.classList.add('active');
            }
        }

        function closeSettingsModalFunc() {
            if (settingsModal) {
                settingsModal.classList.remove('active');
                // Reset username editing state
                if (settingsUsername) {
                    settingsUsername.value = originalUsername;
                    settingsUsername.readOnly = true;
                }
                isEditingUsername = false;
            }
        }

        if (settingsOption) {
            settingsOption.addEventListener('click', () => {
                userDropdown.classList.add('hidden');
                openSettingsModal();
            });
        }

        if (closeSettingsModal) {
            closeSettingsModal.addEventListener('click', closeSettingsModalFunc);
        }

        if (settingsModal) {
            settingsModal.addEventListener('click', (e) => {
                if (e.target === settingsModal) {
                    closeSettingsModalFunc();
                }
            });
        }

        // Username editing
        if (editUsernameBtn && settingsUsername) {
            editUsernameBtn.addEventListener('click', () => {
                if (!isEditingUsername) {
                    // Enable editing
                    settingsUsername.readOnly = false;
                    settingsUsername.focus();
                    settingsUsername.select();
                    isEditingUsername = true;
                    editUsernameBtn.innerHTML = `
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    `;
                    editUsernameBtn.title = "Save username";
                } else {
                    // Save username
                    saveUsername();
                }
            });
        }

        async function saveUsername() {
            const newUsername = settingsUsername.value.trim();
            if (!newUsername || newUsername.length < 3) {
                showToast('Username must be at least 3 characters', 'error');
                settingsUsername.value = originalUsername;
                settingsUsername.readOnly = true;
                isEditingUsername = false;
                editUsernameBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                `;
                return;
            }

            try {
                const response = await makeAPICall('/api/user/username', {
                    method: 'PUT',
                    body: JSON.stringify({ username: newUsername })
                });

                // Update current user
                currentUser.username = newUsername;
                localStorage.setItem('currentUser', JSON.stringify(currentUser));

                // Update UI
                const userName = document.getElementById('user-name');
                if (userName) userName.textContent = newUsername;
                const contextTitle = document.getElementById('context-title');
                if (contextTitle && contextTitle.textContent.includes(originalUsername)) {
                    contextTitle.textContent = contextTitle.textContent.replace(originalUsername, newUsername);
                }

                originalUsername = newUsername;
                settingsUsername.readOnly = true;
                isEditingUsername = false;
                editUsernameBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                `;
                editUsernameBtn.title = "Edit username";

                showToast('Username updated successfully!', 'success', 2000);
            } catch (error) {
                console.error('Error updating username:', error);
                showToast(`Failed to update username: ${error.message}`, 'error', 5000);
                settingsUsername.value = originalUsername;
                settingsUsername.readOnly = true;
                isEditingUsername = false;
                editUsernameBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                `;
            }
        }

        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener('click', async () => {
                try {
                    // If username is being edited, save it first
                    if (isEditingUsername) {
                        await saveUsername();
                    }

                    // Handle password change if provided
                    if (settingsPassword && settingsPassword.value.trim()) {
                        const newPassword = settingsPassword.value.trim();
                        if (newPassword.length < 6) {
                            showToast('Password must be at least 6 characters', 'error', 3000);
                            return;
                        }

                        try {
                            await makeAPICall('/api/user/password', {
                                method: 'PUT',
                                body: JSON.stringify({ password: newPassword })
                            });

                            showToast('Password updated successfully!', 'success', 3000);
                            settingsPassword.value = '';
                        } catch (error) {
                            console.error('Error updating password:', error);
                            showToast(`Failed to update password: ${error.message}`, 'error', 5000);
                            return;
                        }
                    }

                    showToast('Settings saved successfully!', 'success', 2000);
                    closeSettingsModalFunc();
                } catch (error) {
                    console.error('Error saving settings:', error);
                    showToast(`Failed to save settings: ${error.message}`, 'error', 5000);
                }
            });
        }

        if (exportDataBtn) {
            exportDataBtn.addEventListener('click', async () => {
                try {
                    // Get all user stories
                    const stories = await makeAPICall('/api/history');
                    const data = {
                        user: currentUser,
                        stories: stories,
                        exportDate: new Date().toISOString()
                    };

                    // Create download
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `story_data_export_${Date.now()}.json`;
                    a.click();
                    URL.revokeObjectURL(url);

                    showToast('Data exported successfully!', 'success', 3000);
                } catch (error) {
                    console.error('Export error:', error);
                    showToast(`Failed to export data: ${error.message}`, 'error', 5000);
                }
            });
        }

        if (clearCacheBtn) {
            clearCacheBtn.addEventListener('click', () => {
                if (confirm('Clear all cached data? This will log you out.')) {
                    localStorage.clear();
                    location.reload();
                }
            });
        }

        // Archived Chats functionality
        const archivedChatsOption = document.getElementById('archived-chats-option');
        const archivedChatsModal = document.getElementById('archived-chats-modal');
        const closeArchivedModal = document.getElementById('close-archived-modal');
        const archivedChatsList = document.getElementById('archived-chats-list');

        async function loadArchivedChats() {
            if (!archivedChatsList) return;

            try {
                const stories = await makeAPICall('/api/history/archived');

                if (!stories || stories.length === 0) {
                    archivedChatsList.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--text-muted);">No archived stories</div>';
                    return;
                }

                archivedChatsList.innerHTML = stories.map(story => `
                    <div class="archived-story-item" data-story-id="${story.id}">
                        <div class="archived-story-content">
                            <div class="archived-story-title" style="text-align: left;">${story.title.length > 50 ? story.title.substring(0, 50) + '...' : story.title}</div>
                            <div class="archived-story-meta" style="text-align: left;">
                                <span class="archived-story-date">${new Date(story.created_at).toLocaleDateString()}</span>
                                ${story.genre ? `<span class="archived-story-tag">${story.genre}</span>` : ''}
                            </div>
                        </div>
                        <div class="archived-story-actions">
                            <button class="archived-action-btn" onclick="window.unarchiveStory(${story.id})" title="Unarchive">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="21 8 21 21 3 21 3 8"></polyline>
                                    <rect x="1" y="3" width="22" height="5"></rect>
                                    <line x1="10" y1="12" x2="14" y2="12"></line>
                                </svg>
                            </button>
                            <button class="archived-action-btn" onclick="window.deleteArchivedStory(${story.id})" title="Delete">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>
                            <button class="archived-action-btn" onclick="window.loadArchivedStory(${story.id})" title="View">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                            </button>
                        </div>
                    </div>
                `).join('');
            } catch (error) {
                console.error('Error loading archived chats:', error);
                archivedChatsList.innerHTML = '<div style="padding: 40px; text-align: center; color: #ff5555;">Failed to load archived stories</div>';
            }
        }

        function openArchivedChatsModal() {
            if (archivedChatsModal) {
                archivedChatsModal.classList.add('active');
                loadArchivedChats();
            }
        }

        function closeArchivedChatsModal() {
            if (archivedChatsModal) {
                archivedChatsModal.classList.remove('active');
            }
        }

        if (archivedChatsOption) {
            archivedChatsOption.addEventListener('click', () => {
                userDropdown.classList.add('hidden');
                openArchivedChatsModal();
            });
        }

        if (closeArchivedModal) {
            closeArchivedModal.addEventListener('click', closeArchivedChatsModal);
        }

        if (archivedChatsModal) {
            archivedChatsModal.addEventListener('click', (e) => {
                if (e.target === archivedChatsModal) {
                    closeArchivedChatsModal();
                }
            });
        }

        // Global functions for archived chats
        window.unarchiveStory = async function (storyId) {
            try {
                await makeAPICall(`/api/story/${storyId}/unarchive`, {
                    method: 'POST'
                });

                // Remove from archived list
                const storyItem = document.querySelector(`.archived-story-item[data-story-id="${storyId}"]`);
                if (storyItem) {
                    storyItem.style.transition = 'opacity 0.3s ease-out';
                    storyItem.style.opacity = '0';
                    setTimeout(() => storyItem.remove(), 300);
                }

                // Reload archived list
                await loadArchivedChats();

                // Reload main history
                if (window.loadHistory) await window.loadHistory();

                showToast('Story unarchived successfully!', 'success', 2000);
            } catch (error) {
                console.error('Error unarchiving story:', error);
                showToast(`Failed to unarchive story: ${error.message}`, 'error', 5000);
            }
        };

        window.loadArchivedStory = async function (storyId) {
            closeArchivedChatsModal();
            await loadStory(storyId);
        };

        window.deleteArchivedStory = async function (storyId) {
            const confirmed = await showConfirmModal(
                'Delete Story',
                'Are you sure you want to delete this archived story? This action cannot be undone.'
            );

            if (confirmed) {
                try {
                    await makeAPICall(`/api/story/${storyId}`, { method: 'DELETE' });

                    // Remove from archived list
                    const storyItem = document.querySelector(`.archived-story-item[data-story-id="${storyId}"]`);
                    if (storyItem) {
                        storyItem.style.transition = 'opacity 0.3s ease-out';
                        storyItem.style.opacity = '0';
                        setTimeout(() => storyItem.remove(), 300);
                    }

                    // Reload archived list
                    await loadArchivedChats();

                    showToast('Story deleted successfully', 'success', 2000);
                } catch (error) {
                    console.error('Error deleting archived story:', error);
                    showToast(`Failed to delete story: ${error.message}`, 'error', 5000);
                }
            }
        };

        // Logout option
        if (logoutOption) {
            logoutOption.addEventListener('click', () => {
                userDropdown.classList.add('hidden');
                logout();
                // Clear chat and reset UI
                chatFeed.innerHTML = '';
                if (inputArea) {
                    inputArea.classList.remove('bottom-state');
                    inputArea.classList.add('center-state');
                }
                if (promptInstruction) {
                    promptInstruction.style.opacity = '1';
                    promptInstruction.style.display = 'block';
                }
                isFirstInteraction = true;
            });
        }
    }

    // Initialize app - load history if logged in
    function initializeApp() {
        if (window._appInitialized) return; // Prevent duplicate runs
        window._appInitialized = true;

        if (authToken && currentUser) {
            updateUIForAuthState(true);
            // Load history - retry if element not found
            const retryLoad = () => {
                const historyList = document.getElementById('history-list');
                if (historyList) {
                    window.loadHistory().then(() => {
                        // Check for shared story in URL first
                        if (window.pendingSharedStoryId && !isGeneratingStory) {
                            const sharedStoryId = window.pendingSharedStoryId;
                            window.pendingSharedStoryId = null;
                            // Clear URL parameter
                            window.history.replaceState({}, document.title, window.location.pathname);
                            // Load the shared story (use public endpoint)
                            setTimeout(async () => {
                                try {
                                    await loadStory(sharedStoryId, true);
                                } catch (error) {
                                    console.error('Error loading shared story:', error);
                                    showToast('Could not load shared story. It may be private or deleted.', 'error', 5000);
                                }
                            }, 500);
                            return;
                        }

                        // Check for pending story (created but page was reloaded)
                        // BUT ONLY if we're not currently generating a story
                        if (!isGeneratingStory) {
                            const pendingStory = localStorage.getItem('pendingStory');
                            if (pendingStory) {
                                try {
                                    const story = JSON.parse(pendingStory);
                                    // If story was created less than 5 minutes ago, auto-load it
                                    if (Date.now() - story.timestamp < 300000) {
                                        // Auto-load the story to continue the conversation smoothly
                                        setTimeout(async () => {
                                            await loadStory(story.id);
                                            localStorage.removeItem('pendingStory');
                                        }, 500);
                                    } else {
                                        localStorage.removeItem('pendingStory');
                                    }
                                } catch (e) {
                                    console.error('Error parsing pending story:', e);
                                }
                            }
                        }
                    }).catch(err => {
                        console.error('Error loading history:', err);
                        // Retry after delay - but only if not already loading
                        if (!isLoadingHistory) {
                            setTimeout(retryLoad, 1000);
                        }
                    });
                } else {
                    setTimeout(retryLoad, 100);
                }
            };
            retryLoad();
        } else {
            updateUIForAuthState(false);
            // If there's a shared story but user is not logged in, show login prompt
            if (window.pendingSharedStoryId) {
                showToast('Please login to view shared story', 'info', 4000);
                // Store the story ID to load after login
                localStorage.setItem('pendingSharedStoryId', window.pendingSharedStoryId.toString());
            }
        }
    }

    // Initialize immediately or when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApp);
    } else {
        initializeApp();
    }

    // Optional: a single guarded re-check after small delay (only if not yet initialized)
    setTimeout(() => { if (!window._appInitialized) initializeApp(); }, 500);

    // Reload history on visibility change (when tab becomes active)
    // Only reload if we haven't just made changes (to prevent unnecessary reloads)
    window.lastHistoryUpdate = Date.now();
    document.addEventListener('visibilitychange', () => {
        // DON'T reload history if we're generating a story
        if (isGeneratingStory) {
            console.log('Skipping history reload - story generation in progress');
            return;
        }

        if (!document.hidden && authToken && currentUser) {
            // Only reload if it's been more than 10 seconds since last update
            // This prevents reloading right after story generation, delete/rename operations
            const timeSinceUpdate = Date.now() - (window.lastHistoryUpdate || 0);
            if (timeSinceUpdate > 10000) {
                // Only reload history sidebar, don't interfere with current story view
                setTimeout(() => {
                    if (!isGeneratingStory && !isLoadingHistory) {
                        window.loadHistory().catch(err => console.warn('Background history reload failed:', err));
                    }
                }, 300);
            }
        }
    });
});

// Global function for generating images (must be accessible from onclick)
window.generateImages = async function (storyId) {
    try {
        console.log('generateImages called for storyId:', storyId);

        // Find bookWrap element at the start
        const bookWrap = document.querySelector(`[data-story-id="${storyId}"]`);
        if (!bookWrap) {
            console.error('Book wrap not found for story:', storyId);
            showToast('Story not found in display', 'error');
            return;
        }

        const response = await makeAPICall(`/api/generate-images/${storyId}`, {
            method: 'POST'
        });

        console.log('Image generation API response:', response);

        // Check if rate limited
        if (response.rate_limited) {
            showToast(
                `Rate limit reached. Generated ${response.completed}/${response.total} images. Please wait a moment and try again.`,
                'error',
                8000
            );
            // Reload story to show partial images
            try {
                const story = await makeAPICall(`/api/story/${storyId}`);
                updateStoryImages(bookWrap, story);
            } catch (e) {
                console.warn('Could not reload story after rate limit:', e);
            }
            return;
        }

        // Check if partial success
        if (response.partial) {
            showToast(
                response.message || `Generated ${response.completed || response.image_urls?.length || 0} images. Some failed.`,
                'info',
                6000
            );
        } else {
            showToast('Images generated successfully!', 'success', 4000);
        }

        // Reload the story to get updated image URLs
        const story = await makeAPICall(`/api/story/${storyId}`);

        // Update the display
        updateStoryImages(bookWrap, story);

    } catch (error) {
        console.error('Image generation error:', error);
        let errorMsg = error.message || 'Failed to generate images';

        // Handle rate limit errors specifically
        if (errorMsg.includes('429') || errorMsg.includes('rate limit') || errorMsg.includes('Rate limit')) {
            errorMsg = 'Rate limit reached. Your story is saved. Please wait a moment and try generating images again.';
            showToast(errorMsg, 'error', 8000);
        } else {
            showToast(`Error: ${errorMsg}`, 'error', 6000);
        }

        // Reset placeholder on error
        const bookWrap = document.querySelector(`[data-story-id="${storyId}"]`);
        if (bookWrap) {
            const leftPage = bookWrap.querySelector('.left-page');
            if (leftPage) {
                const currentIndex = 0; // Default to first scene
                leftPage.innerHTML = `<div class="generated-image-placeholder">
                    <div class="art-overlay"></div>
                    <span class="img-label">Scene ${currentIndex + 1}<br><small>Click "Generate Images" to create</small></span>
                </div>`;
            }
        }
    }
};

// Helper function to update story images
function updateStoryImages(bookWrap, story) {
    if (!bookWrap || !story || !story.scenes) return;

    // Find current page index
    const currentSceneText = bookWrap.querySelector('.page-content p.scene-desc')?.textContent;
    let currentIndex = 0;
    if (currentSceneText) {
        currentIndex = story.scenes.findIndex(s => s.scene_text === currentSceneText);
        if (currentIndex === -1) currentIndex = 0;
    }

    const scene = story.scenes[currentIndex];
    const leftPage = bookWrap.querySelector('.left-page');
    if (leftPage && (scene.image_url || scene.image_path)) {
        // Use image_url if available, otherwise construct from image_path
        const imageUrl = scene.image_url
            ? `${API_BASE_URL}${scene.image_url}`
            : scene.image_path
                ? `${API_BASE_URL}/scene_images/${scene.image_path.split(/[/\\]/).pop()}`
                : null;

        if (imageUrl) {
            leftPage.innerHTML = `<img src="${imageUrl}" alt="Scene ${currentIndex + 1}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.parentElement.innerHTML='<div class=\\'generated-image-placeholder\\'><div class=\\'art-overlay\\'></div><span class=\\'img-label\\'>Image loading failed</span></div>'">`;
        }
    }
}

// Book action functions
window.expandBook = async function (storyId) {
    // CRITICAL FIX: Specific selector to avoid matching sidebar history items
    const bookWrap = document.querySelector(`.book-container-wrap[data-story-id="${storyId}"]`);

    if (!bookWrap) {
        console.error('Book wrap not found for story:', storyId);
        // Try to find by partial match or log all IDs
        const allWraps = document.querySelectorAll('.book-container-wrap');
        console.log('Available book wraps:', Array.from(allWraps).map(w => w.getAttribute('data-story-id')));
        return;
    }

    // Check if already expanded
    const existingOverlay = document.getElementById('book-expand-overlay');
    if (existingOverlay) {
        existingOverlay.remove();
        bookWrap.classList.remove('expanded');
        return;
    }

    // Get story data from bookWrap - if not available, fetch from API (skip for suggestions)
    let storyData = bookWrap.storyData;
    const isSuggestion = storyId?.toString().startsWith('suggestion_');

    if (!storyData || !storyData.scenes) {
        // For suggestions, data should be in bookWrap - if not, can't fetch from API
        if (isSuggestion) {
            console.error('Suggestion story data not found in bookWrap:', storyId);
            showToast('Error: Suggestion data not found.', 'error');
            return;
        }

        // Try to fetch story data if not stored on bookWrap (for previously loaded stories)
        try {
            const story = await makeAPICall(`/api/story/${storyId}`);
            if (story && story.scenes) {
                storyData = story;
                // Store it on bookWrap for future use
                bookWrap.storyData = JSON.parse(JSON.stringify(story));
                bookWrap.originalTitle = story.original_title || story.title;
            } else {
                console.error('Story data not found for story:', storyId);
                return;
            }
        } catch (error) {
            console.error('Failed to fetch story data:', error);
            return;
        }
    }

    // Get current page index from bookWrap (persisted from navigation)
    const currentPageIndex = bookWrap.currentPageIndex || 0;

    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'book-expand-overlay';
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.95); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px; overflow: auto;';

    // Clone the entire book container to maintain structure
    const bookContainer = bookWrap.cloneNode(true);
    bookContainer.style.cssText = 'width: 100%; max-width: 800px; margin: auto;';

    // Get the book-spread and ensure it maintains the same aspect ratio as in chat
    const bookSpread = bookContainer.querySelector('.book-spread');
    if (!bookSpread) {
        console.error('Book spread not found');
        return;
    }

    // Maintain the same aspect ratio and sizing as in chat feed (max-width: 800px)
    bookSpread.style.cssText = 'width: 100%; max-width: 800px; margin: 0 auto;';

    // Reattach event listeners for page navigation in expanded view
    const expandedNextBtn = bookContainer.querySelector('.next-btn[data-story-id="' + storyId + '"]');
    const expandedPrevBtn = bookContainer.querySelector('.prev-btn[data-story-id="' + storyId + '"]');
    const expandedLeftPage = bookContainer.querySelector(`#left-page-${storyId}`);
    const expandedContentArea = bookContainer.querySelector(`#book-content-area-${storyId}`);

    // Store current page index on cloned container
    let expandedPageIndex = currentPageIndex;
    bookContainer.currentPageIndex = expandedPageIndex;

    // Get original title for book canvas
    const originalTitle = bookWrap.originalTitle || storyData.original_title || storyData.title;
    const bookCanvasData = {
        ...storyData,
        title: originalTitle
    };

    // Function to update page in expanded view
    const updateExpandedPage = () => {
        const scene = storyData.scenes[expandedPageIndex];
        const imageUrl = scene.image_url
            ? `${API_BASE_URL}${scene.image_url}`
            : scene.image_path
                ? `${API_BASE_URL}/scene_images/${scene.image_path.split(/[/\\]/).pop()}`
                : null;

        if (expandedContentArea) {
            expandedContentArea.style.opacity = '0';
            setTimeout(() => {
                // Use window.getPageHTML to ensure it's accessible
                const pageHTML = window.getPageHTML ? window.getPageHTML(scene, bookCanvasData) : getPageHTML(scene, bookCanvasData);
                expandedContentArea.innerHTML = pageHTML;
                expandedContentArea.style.opacity = '1';
            }, 200);
        }

        if (expandedLeftPage) {
            expandedLeftPage.style.opacity = '0';
            setTimeout(() => {
                if (imageUrl) {
                    expandedLeftPage.innerHTML = `<img src="${imageUrl}" alt="Scene ${expandedPageIndex + 1}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.parentElement.innerHTML='<div class=\\'generated-image-placeholder\\'><div class=\\'art-overlay\\'></div><span class=\\'img-label\\'>Image not found</span></div>'">`;
                } else {
                    expandedLeftPage.innerHTML = `<div class="generated-image-placeholder">
                        <div class="art-overlay"></div>
                        <span class="img-label">Scene ${expandedPageIndex + 1}<br><small>No image yet</small></span>
                    </div>`;
                }
                expandedLeftPage.style.opacity = '1';
            }, 200);
        }

        // Update buttons state
        if (expandedNextBtn) {
            expandedNextBtn.style.opacity = expandedPageIndex < storyData.scenes.length - 1 ? '1' : '0.5';
            expandedNextBtn.style.pointerEvents = expandedPageIndex < storyData.scenes.length - 1 ? 'auto' : 'none';
        }
        if (expandedPrevBtn) {
            expandedPrevBtn.style.opacity = expandedPageIndex > 0 ? '1' : '0.5';
            expandedPrevBtn.style.pointerEvents = expandedPageIndex > 0 ? 'auto' : 'none';
        }
    };

    // Attach event listeners
    if (expandedNextBtn) {
        expandedNextBtn.addEventListener('click', () => {
            if (expandedPageIndex < storyData.scenes.length - 1) {
                expandedPageIndex++;
                bookContainer.currentPageIndex = expandedPageIndex;
                bookWrap.currentPageIndex = expandedPageIndex; // Sync back to original
                updateExpandedPage();
            }
        });
    }

    if (expandedPrevBtn) {
        expandedPrevBtn.addEventListener('click', () => {
            if (expandedPageIndex > 0) {
                expandedPageIndex--;
                bookContainer.currentPageIndex = expandedPageIndex;
                bookWrap.currentPageIndex = expandedPageIndex; // Sync back to original
                updateExpandedPage();
            }
        });
    }

    // Initialize expanded view with current page
    updateExpandedPage();

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕';
    closeBtn.style.cssText = 'position: fixed; top: 20px; right: 20px; width: 40px; height: 40px; background: rgba(255, 255, 255, 0.1); border: none; border-radius: 50%; color: white; font-size: 24px; cursor: pointer; z-index: 10000; transition: background 0.2s;';
    closeBtn.onmouseover = () => closeBtn.style.background = 'rgba(255, 255, 255, 0.2)';
    closeBtn.onmouseout = () => closeBtn.style.background = 'rgba(255, 255, 255, 0.1)';
    closeBtn.onclick = () => {
        overlay.remove();
        bookWrap.classList.remove('expanded');
        document.removeEventListener('keydown', handleEscape);
    };

    // Also close on Escape key
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            overlay.remove();
            bookWrap.classList.remove('expanded');
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);

    overlay.appendChild(bookContainer);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
    bookWrap.classList.add('expanded');
};

// Helper to wrap text for canvas
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const paragraphs = text.split('\n');
    let currentY = y;

    paragraphs.forEach(paragraph => {
        const words = paragraph.split(' ');
        let line = '';

        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = ctx.measureText(testLine);
            const testWidth = metrics.width;

            if (metrics.width > maxWidth && n > 0) {
                ctx.fillText(line, x, currentY);
                line = words[n] + ' ';
                currentY += lineHeight;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line, x, currentY);
        currentY += lineHeight;
    });
    return currentY; // Return the new Y position
}

// Helper for robust image fetching with retries
async function fetchImageWithRetry(url, retries = 3, delay = 500) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url);
            if (response.ok) return await response.blob();
        } catch (err) {
            console.warn(`Fetch attempt ${i + 1} failed for ${url}`, err);
        }
        if (i < retries - 1) await new Promise(r => setTimeout(r, delay));
    }
    return null;
}

window.downloadPage = async function (storyId) {
    // CRITICAL FIX: Specific selector to avoid matching sidebar history items
    const bookWrap = document.querySelector(`.book-container-wrap[data-story-id="${storyId}"]`);
    if (!bookWrap) {
        console.error('Book wrap not found for story:', storyId);
        showToast('Error: Book content not found. Please try reloading.', 'error');
        return;
    }

    // Get current page index dynamically from the DOM element
    // This fixes the issue where the button had a stale index
    // Also ensures we default to 0 if undefined
    const pageIndex = bookWrap.currentPageIndex !== undefined ? bookWrap.currentPageIndex : 0;

    // Debug log to confirm index
    console.log(`Downloading story ${storyId}, page index: ${pageIndex}`);

    // Get story data from bookWrap - if not available, fetch from API (skip for suggestions)
    let storyData = bookWrap.storyData;
    const isSuggestion = storyId?.toString().startsWith('suggestion_');

    if (!storyData || !storyData.scenes || !storyData.scenes[pageIndex]) {
        // For suggestions, data should be in bookWrap - if not, can't fetch from API
        if (isSuggestion) {
            console.error('Suggestion story data not found in bookWrap:', storyId);
            showToast('Error: Suggestion data not found.', 'error');
            return;
        }

        // Try to fetch story data if not stored on bookWrap
        try {
            const story = await makeAPICall(`/api/story/${storyId}`);
            if (story && story.scenes && story.scenes[pageIndex]) {
                storyData = story;
                // Store it on bookWrap for future use
                bookWrap.storyData = JSON.parse(JSON.stringify(story));
                bookWrap.originalTitle = story.original_title || story.title;
            } else {
                console.error('Story data or scene not found');
                return;
            }
        } catch (error) {
            console.error('Failed to fetch story data:', error);
            return;
        }
    }

    const scene = storyData.scenes[pageIndex];
    const originalTitle = bookWrap.originalTitle || storyData.original_title || storyData.title;

    // Get image URL from scene data (more reliable than DOM)
    let imageUrl = scene.image_url
        ? `${API_BASE_URL}${scene.image_url}`
        : scene.image_path
            ? `${API_BASE_URL}/scene_images/${scene.image_path.split(/[/\\]/).pop()}`
            : null;

    // Append timestamp to prevent caching issues
    if (imageUrl) {
        imageUrl += `?t=${Date.now()}`;
    }

    // Create canvas with 3:2 aspect ratio (standard book spread)
    // Each page is 3:4 (e.g. 1200x1600), so two pages = 2400x1600
    const canvas = document.createElement('canvas');
    canvas.width = 2400;
    canvas.height = 1600;
    const ctx = canvas.getContext('2d');

    const halfWidth = canvas.width / 2; // 1200px
    const height = canvas.height;      // 1600px

    // Draw textured background (like the book) - right side
    const gradient = ctx.createLinearGradient(halfWidth, 0, canvas.width, height);
    gradient.addColorStop(0, '#fdfaf4');
    gradient.addColorStop(1, '#f5f0e8');
    ctx.fillStyle = gradient;
    ctx.fillRect(halfWidth, 0, halfWidth, height);

    // Add paper texture overlay on right side
    ctx.fillStyle = 'rgba(0, 0, 0, 0.02)';
    for (let i = 0; i < 200; i++) {
        ctx.fillRect(halfWidth + Math.random() * halfWidth, Math.random() * height, 3, 3);
    }

    // Draw book spine effect in center
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fillRect(halfWidth - 15, 0, 30, height);

    // Use fetch+blob with retry for robust image loading
    try {
        let imageBlob = null;
        if (imageUrl) {
            imageBlob = await fetchImageWithRetry(imageUrl);
        }

        let img = new Image();
        if (imageBlob) {
            img.src = URL.createObjectURL(imageBlob);
        } else {
            // Placeholder
            img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwMCIgaGVpZ2h0PSIxNjAwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiMwMDAiLz48dGV4dCB5PSI1MCUiIHg9IjUwJSIgZHk9Ii4zZW0iIGZpbGw9IiNmZmYiIGZvbnQtZmFtaWx5PSJzYXlzLXNlcmVmIiBmb250LXNpemU9IjY0IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5ObyBJbWFnZTwvdGV4dD48L3N2Zz4=';
        }

        // Wait for decode
        await img.decode();

        // Draw black background for left side
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, halfWidth, height);

        // Draw image
        const imgAspect = img.width / img.height;
        const pageAspect = halfWidth / height; // 0.75 (3:4)

        let drawWidth, drawHeight, drawX, drawY;

        if (imgAspect > pageAspect) {
            // Image is wider than page (e.g. 16:9 vs 3:4)
            // To cover, we must match HEIGHT and crop width
            drawHeight = height;
            drawWidth = height * imgAspect;
            drawX = (halfWidth - drawWidth) / 2;
            drawY = 0;
        } else {
            // Image is taller than page (e.g. 1:2 vs 3:4) - rare for 3:4 target
            // To cover, we must match WIDTH and crop height
            drawWidth = halfWidth;
            drawHeight = halfWidth / imgAspect;
            drawX = 0;
            drawY = (height - drawHeight) / 2;
        }

        ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

        // Cleanup object URL if created
        if (imageBlob) {
            URL.revokeObjectURL(img.src);
        }

    } catch (e) {
        console.error('Failed to load/decode image', e);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, halfWidth, height);
        ctx.fillStyle = '#fff';
        ctx.font = '48px Georgia';
        ctx.textAlign = 'center';
        ctx.fillText('Image Unavailable', halfWidth / 2, height / 2);
        ctx.textAlign = 'left';
    }

    // --- RIGHT SIDE TEXT RENDERING ---
    // Canvas is 2400x1600. Right page is 1200x1600.
    // Base layout was 600 width. Scale = 1200 / 600 = 2.0

    // Scale increased to 2.8 for better readability/size

    const scale = 2.8;
    const padding = 100;
    const startX = halfWidth + padding;
    const maxWidth = halfWidth - (padding * 2);
    let currentY = 200;

    // Title
    ctx.fillStyle = '#111';
    ctx.font = `bold ${32 * scale}px Georgia, serif`;
    const title = originalTitle || storyData.title || 'Untitled Story';
    ctx.fillText(title, startX, currentY);

    // Gold line
    const titleMetrics = ctx.measureText(title);
    currentY += 24;
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(startX, currentY);
    ctx.lineTo(startX + Math.min(titleMetrics.width, maxWidth), currentY);
    ctx.stroke();

    // Scene description
    currentY += 120; // More spacing
    ctx.font = `${20 * scale}px Georgia, serif`;
    ctx.fillStyle = '#333';
    const sceneText = scene.scene_text || '';
    const lineHeight = Math.round(20 * scale * 1.6);

    wrapText(ctx, sceneText, startX, currentY, maxWidth, lineHeight);

    // Tags
    let tagY = height - 150;
    let tagX = startX;
    const tagHeight = 40;
    const tagPadding = 20;

    ctx.font = `${16 * scale}px "Segoe UI", sans-serif`;
    const tags = [];
    if (storyData.genre) tags.push(storyData.genre);
    if (storyData.style) tags.push(storyData.style);

    tags.forEach(tag => {
        const tagText = tag.toUpperCase();
        const tagMetrics = ctx.measureText(tagText);
        const tagWidth = tagMetrics.width;

        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 3;
        ctx.strokeRect(tagX, tagY, tagWidth + tagPadding * 2, tagHeight + 20);

        ctx.fillStyle = '#666';
        ctx.fillText(tagText, tagX + tagPadding, tagY + 40);

        tagX += tagWidth + tagPadding * 2 + 30;
    });

    // Download
    canvas.toBlob(function (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `scene-${pageIndex + 1}.png`;
        a.click();
        URL.revokeObjectURL(url);
    }, 'image/png');
};

// Helper function to draw content on canvas (matching website style exactly)
function drawCanvasContent(ctx, scene, storyData, originalTitle) {
    const canvasWidth = 2400;
    const canvasHeight = 1600;
    const halfWidth = canvasWidth / 2;

    // Draw right side content
    const gradient = ctx.createLinearGradient(halfWidth, 0, canvasWidth, canvasHeight);
    gradient.addColorStop(0, '#fdfaf4');
    gradient.addColorStop(1, '#f5f0e8');
    ctx.fillStyle = gradient;
    ctx.fillRect(halfWidth, 0, halfWidth, canvasHeight);

    // Add paper texture overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.02)';
    for (let j = 0; j < 200; j++) {
        ctx.fillRect(halfWidth + Math.random() * halfWidth, Math.random() * canvasHeight, 3, 3);
    }

    // Title with gold line
    // Scale 3.0 relative to screen (400px page -> 1200px page)
    const scale = 3.0;

    const padding = 100; // Increased padding
    const startX = halfWidth + padding;
    const maxWidth = halfWidth - (padding * 2);
    let currentY = 240; // Adjusted top margin

    ctx.fillStyle = '#111';
    // Title Font: ~86px bold
    const titleFontSize = 28.8 * scale;
    ctx.font = `bold ${titleFontSize}px Georgia, serif`;
    const title = originalTitle || storyData.title || 'Untitled Story';

    // Wrap title and get new Y position
    const titleLineHeight = titleFontSize * 1.2;
    const titleEndY = wrapText(ctx, title, startX, currentY, maxWidth, titleLineHeight);

    // Gold line (positioned relative to end of title)
    currentY = titleEndY + 24; // Spacing after title
    const titleMetrics = ctx.measureText(title);
    // Determine line length: if title wrapped, use partial width or max width
    const lineLength = Math.min(titleMetrics.width, maxWidth);

    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 5; // Thicker line
    ctx.beginPath();
    ctx.moveTo(startX, currentY);
    // Dynamic line length based on title width (from measureText above)
    // Make it at least 200px or full title width, capped at maxWidth
    ctx.moveTo(startX, currentY);
    // Dynamic line length based on title width (from measureText above)
    // Make it at least 200px or full title width, capped at maxWidth
    // Reuse existing variable or just use the value directly
    const dynamicLineLength = Math.max(200, Math.min(titleMetrics.width, maxWidth));
    ctx.lineTo(startX + dynamicLineLength, currentY);
    ctx.stroke();

    // Scene text
    currentY += 80; // Margin after gold line
    // Body Font: ~50px
    ctx.font = `${16.8 * scale}px Georgia, serif`;
    ctx.fillStyle = '#333';
    const sceneText = scene.scene_text || '';
    // Line height ~1.7em -> ~85px
    const lineHeight = Math.round(16.8 * scale * 1.7);

    // Use wrapText helper
    wrapText(ctx, sceneText, startX, currentY, maxWidth, lineHeight);

    // Tags (matching website style)
    if (storyData.genre || storyData.style) {
        // Tag Font: ~36px
        ctx.font = `${12 * scale}px "Segoe UI", sans-serif`;
        ctx.fillStyle = '#666';
        let tagX = startX;
        let tagY = canvasHeight - 150;
        const tagHeight = 50; // Taller tags
        const tagPadding = 25;

        if (storyData.genre) {
            const genreText = storyData.genre.toUpperCase();
            const genreWidth = ctx.measureText(genreText).width;
            ctx.strokeStyle = '#ddd';
            ctx.lineWidth = 3;
            // Draw rounded rect manually or with strokeRect
            ctx.strokeRect(tagX, tagY, genreWidth + tagPadding * 2, tagHeight + 20);
            ctx.fillText(genreText, tagX + tagPadding, tagY + 45); // Centered text
            tagX += genreWidth + tagPadding * 2 + 30;
        }

        if (storyData.style) {
            const styleText = storyData.style.toUpperCase();
            const styleWidth = ctx.measureText(styleText).width;
            ctx.strokeStyle = '#ddd';
            ctx.lineWidth = 3;
            ctx.strokeRect(tagX, tagY, styleWidth + tagPadding * 2, tagHeight + 20);
            ctx.fillText(styleText, tagX + tagPadding, tagY + 45);
        }
    }
}

window.exportBook = async function (storyId) {
    try {
        // Get story data - try from bookWrap first, then API (skip for suggestions)
        const bookWrap = document.querySelector(`[data-story-id="${storyId}"]`);
        let story = bookWrap?.storyData;
        const isSuggestion = storyId?.toString().startsWith('suggestion_');

        if (!story || !story.scenes) {
            // For suggestions, data should be in bookWrap - if not, can't fetch from API
            if (isSuggestion) {
                showToast('Error: Suggestion data not found.', 'error');
                return;
            }
            story = await makeAPICall(`/api/story/${storyId}`);
        }

        if (!story || !story.scenes || story.scenes.length === 0) {
            showToast('No story data to export', 'error');
            return;
        }

        showToast('Generating images...', 'info', 2000);

        const originalTitle = bookWrap?.originalTitle || story.original_title || story.title;
        const storyData = {
            ...story,
            title: originalTitle
        };

        // Create images for each scene (SEQUENTIALLY to prevent missing images)
        // Using Promise loop instead of Promise.all
        const canvases = [];

        for (let i = 0; i < story.scenes.length; i++) {
            const scene = story.scenes[i];
            let imageUrl = scene.image_url
                ? `${API_BASE_URL}${scene.image_url}`
                : scene.image_path
                    ? `${API_BASE_URL}/scene_images/${scene.image_path.split(/[/\\]/).pop()}`
                    : null;

            // Append timestamp to prevent caching issues
            if (imageUrl) {
                imageUrl += `?t=${Date.now()}-${i}`;
            }

            const canvas = document.createElement('canvas');
            canvas.width = 2400;
            canvas.height = 1600;
            const ctx = canvas.getContext('2d');

            const halfWidth = canvas.width / 2;
            const height = canvas.height;

            // Draw book spine effect in center
            ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
            ctx.fillRect(halfWidth - 15, 0, 30, height);

            // Fetch image data first with retry
            try {
                let imageBlob = null;
                if (imageUrl) {
                    imageBlob = await fetchImageWithRetry(imageUrl);
                }

                const img = new Image();
                if (imageBlob) {
                    img.src = URL.createObjectURL(imageBlob);
                } else {
                    img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwMCIgaGVpZ2h0PSIxNjAwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiMwMDAiLz48dGV4dCB5PSI1MCUiIHg9IjUwJSIgZHk9Ii4zZW0iIGZpbGw9IiNmZmYiIGZvbnQtZmFtaWx5PSJzYXlzLXNlcmVmIiBmb250LXNpemU9IjY0IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5ObyBJbWFnZTwvdGV4dD48L3N2Zz4=';
                }

                // Wait for decode
                await img.decode();

                // Draw image
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, halfWidth, height);

                const imgAspect = img.width / img.height;
                const pageAspect = halfWidth / height;
                let drawWidth, drawHeight, drawX, drawY;

                if (imgAspect > pageAspect) {
                    // Cover mode: Image wider -> Match Height
                    drawHeight = height;
                    drawWidth = height * imgAspect;
                    drawX = (halfWidth - drawWidth) / 2;
                    drawY = 0;
                } else {
                    // Cover mode: Image taller -> Match Width
                    drawWidth = halfWidth;
                    drawHeight = halfWidth / imgAspect;
                    drawX = 0;
                    drawY = (height - drawHeight) / 2;
                }

                ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

                if (imageBlob) {
                    URL.revokeObjectURL(img.src);
                }

            } catch (err) {
                console.error(`Error processing image for scene ${i}:`, err);
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, halfWidth, height);
                ctx.fillStyle = '#fff';
                ctx.font = '48px Georgia';
                ctx.textAlign = 'center';
                ctx.fillText('Image Unavailable', halfWidth / 2, height / 2);
                ctx.textAlign = 'left';
            }

            drawCanvasContent(ctx, scene, storyData, originalTitle);
            canvases.push(canvas);
        }

        // Wait for all images to be generated (already done sequentially)
        // const canvases = await Promise.all(imagePromises); // Removed

        // Create PDF from canvases
        const { jsPDF } = window.jspdf;
        // Use matching aspect ratio (3:2)
        const pdf = new jsPDF({
            orientation: 'landscape',
            unit: 'px',
            format: [2400, 1600]
        });

        for (let i = 0; i < canvases.length; i++) {
            if (i > 0) {
                pdf.addPage([2400, 1600], 'landscape');
            }
            const canvas = canvases[i];
            const imgData = canvas.toDataURL('image/png');
            pdf.addImage(imgData, 'PNG', 0, 0, 2400, 1600, undefined, 'FAST');
        }

        // Save PDF
        const filename = `${(originalTitle || 'story').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_export.pdf`;
        pdf.save(filename);

        showToast('Book exported successfully!', 'success', 3000);
    } catch (error) {
        console.error('Export error:', error);
        showToast(`Failed to export book: ${error.message}`, 'error', 5000);
    }
};

// History menu functions
window.shareStory = async function () {
    let storyId = null;
    let storyTitle = 'Story';

    // If activeKebabBtn is set, we are sharing from the history list menu
    if (activeKebabBtn) {
        // Store information BEFORE closing menu
        const storyWrap = activeKebabBtn.closest('.history-item-wrap');
        storyId = storyWrap?.getAttribute('data-story-id');
        storyTitle = storyWrap?.querySelector('.history-item')?.textContent || 'Story';

        // Close global menu immediately
        if (window.closeGlobalMenu) window.closeGlobalMenu();
    } else {
        // Otherwise, we are sharing the currently loaded story (e.g. from top bar)
        if (currentStoryId) {
            storyId = currentStoryId;
            const contextTitle = document.getElementById('context-title');
            storyTitle = contextTitle?.textContent || 'Story';
        }

        // Close top bar menu if it's open
        const topBarMenu = document.getElementById('top-bar-story-menu');
        if (topBarMenu && !topBarMenu.classList.contains('hidden')) {
            topBarMenu.classList.add('hidden');
        }
    }

    if (!storyId) {
        showToast('No story selected to share', 'error');
        return;
    }

    const url = `${window.location.origin}?story=${storyId}`;
    const shareText = `Check out this story: ${storyTitle}`;

    // Try Web Share API first (mobile devices)
    if (navigator.share) {
        try {
            await navigator.share({
                title: storyTitle,
                text: shareText,
                url: url
            });
            showToast('Story shared successfully!', 'success');
            return;
        } catch (err) {
            // User cancelled or error, fall back to clipboard
            if (err.name !== 'AbortError') {
                console.log('Web Share API error:', err);
            }
        }
    }

    // Fallback: Copy to clipboard
    try {
        await navigator.clipboard.writeText(url);
        showToast('Story link copied to clipboard!', 'success');
    } catch (err) {
        // Fallback: Show modal with link
        showShareModal(storyId, storyTitle, url);
    }
};

// Share modal for manual sharing
function showShareModal(storyId, storyTitle, url) {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop active';
    modal.innerHTML = `
        <div class="modal-content auth-modal" style="max-width: 500px;">
            <div class="modal-header">
                <h3>Share Story</h3>
                <p>Share "${storyTitle}" with others</p>
            </div>
            <div class="settings-content">
                <div class="form-group">
                    <label>Share Link</label>
                    <div style="display: flex; gap: 8px;">
                        <input type="text" id="share-url-input" value="${url}" readonly 
                               style="flex: 1; padding: 10px; background: var(--bg-input); border: 1px solid var(--border-light); border-radius: 6px; color: var(--text-primary);">
                        <button class="action-btn-sm primary-btn" onclick="copyShareUrl()">Copy</button>
                    </div>
                </div>
                <div style="margin-top: 20px;">
                    <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 10px;">Share via:</p>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}" 
                           target="_blank" class="action-btn-sm" style="text-decoration: none; display: inline-block;">
                            Twitter
                        </a>
                        <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" 
                           target="_blank" class="action-btn-sm" style="text-decoration: none; display: inline-block;">
                            Facebook
                        </a>
                        <a href="mailto:?subject=${encodeURIComponent(storyTitle)}&body=${encodeURIComponent(shareText + ' ' + url)}" 
                           class="action-btn-sm" style="text-decoration: none; display: inline-block;">
                            Email
                        </a>
                    </div>
                </div>
            </div>
            <div class="modal-actions">
                <button class="action-btn-sm modal-cancel-btn" onclick="closeShareModal()">Close</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    window.copyShareUrl = function () {
        const input = document.getElementById('share-url-input');
        input.select();
        document.execCommand('copy');
        showToast('Link copied to clipboard!', 'success');
    };

    window.closeShareModal = function () {
        modal.remove();
        delete window.copyShareUrl;
        delete window.closeShareModal;
    };

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            window.closeShareModal();
        }
    });
}

window.renameStory = async function () {
    if (!activeKebabBtn) return;

    // Store information BEFORE closing menu
    const storyWrap = activeKebabBtn.closest('.history-item-wrap');
    const storyIdStr = storyWrap?.getAttribute('data-story-id');
    const currentTitle = storyWrap?.querySelector('.history-item')?.textContent || '';

    // Close menu immediately
    if (window.closeGlobalMenu) window.closeGlobalMenu();

    // Validate storyId
    if (!storyIdStr || !storyWrap) {
        showToast('Invalid story selected', 'error');
        return;
    }

    const storyId = parseInt(storyIdStr, 10);
    if (isNaN(storyId) || storyId <= 0) {
        showToast('Invalid story ID', 'error');
        return;
    }

    const cleanTitle = currentTitle.replace('...', '').trim();

    const newTitle = await showInputModal(
        'Rename Story',
        'Enter a new title for this story',
        'Story Title',
        'Enter story title',
        cleanTitle
    );

    if (newTitle && newTitle.trim()) {
        try {
            await makeAPICall(`/api/story/${storyId}`, {
                method: 'PUT',
                body: JSON.stringify({ title: newTitle.trim() })
            });

            const trimmedTitle = newTitle.trim();

            // 1. Update the title in history list
            const titleElement = storyWrap.querySelector('.history-item');
            if (titleElement) {
                titleElement.textContent = trimmedTitle.length > 20 ? trimmedTitle.substring(0, 20) + '...' : trimmedTitle;
            }

            // 2. Update top bar title if this story is currently loaded
            if (currentStoryId === storyId) {
                const contextTitle = document.getElementById('context-title');
                if (contextTitle) {
                    contextTitle.textContent = trimmedTitle;
                }
            }

            // Note: We intentionally do NOT update the book canvas title when renaming
            // The book canvas keeps its original generated title

            // Update timestamp to prevent visibilitychange from reloading
            if (window.lastHistoryUpdate !== undefined) {
                window.lastHistoryUpdate = Date.now();
            }

            showToast('Story renamed successfully', 'success');
        } catch (error) {
            console.error('Error renaming story:', error);
            let errorMsg = error.message || 'Unknown error';

            // Provide helpful message for 405 errors
            if (errorMsg.includes('405') || errorMsg.includes('Method Not Allowed')) {
                errorMsg = 'Method Not Allowed. Please restart the backend server (run: python main.py)';
                console.error('Backend server may need to be restarted to register PUT endpoint');
            }

            showToast(`Failed to rename story: ${errorMsg}`, 'error', 6000);
        }
    }
};

window.deleteStory = async function () {
    if (!activeKebabBtn) return;

    // Store information BEFORE closing menu
    const storyWrap = activeKebabBtn.closest('.history-item-wrap');
    const storyIdStr = storyWrap?.getAttribute('data-story-id');

    // Close menu immediately
    if (window.closeGlobalMenu) window.closeGlobalMenu();

    // Validate storyId
    if (!storyIdStr || !storyWrap) {
        showToast('Invalid story selected', 'error');
        return;
    }

    const storyId = parseInt(storyIdStr, 10);
    if (isNaN(storyId) || storyId <= 0) {
        showToast('Invalid story ID', 'error');
        return;
    }

    const confirmed = await showConfirmModal(
        'Delete Story',
        'Are you sure you want to delete this story? This action cannot be undone.'
    );

    if (confirmed) {
        try {
            await makeAPICall(`/api/story/${storyId}`, { method: 'DELETE' });
            // Remove the element from DOM immediately - smooth removal with fade out
            storyWrap.style.transition = 'opacity 0.3s ease-out';
            storyWrap.style.opacity = '0';
            setTimeout(() => {
                storyWrap.remove();
            }, 300);

            // Update timestamp to prevent visibilitychange from reloading
            if (window.lastHistoryUpdate !== undefined) {
                window.lastHistoryUpdate = Date.now();
            }

            // Show success message
            showToast('Story deleted successfully', 'success');
        } catch (error) {
            console.error('Error deleting story:', error);
            let errorMsg = error.message || 'Unknown error';

            // Provide helpful message for 405 errors
            if (errorMsg.includes('405') || errorMsg.includes('Method Not Allowed')) {
                errorMsg = 'Method Not Allowed. Please restart the backend server (run: python main.py)';
                console.error('Backend server may need to be restarted to register DELETE endpoint');
            }

            showToast(`Failed to delete story: ${errorMsg}`, 'error', 6000);
        }
    }
};
