/**
 * Quote Form - Single Page Form with Supabase Integration
 * Handles form validation and submission to Supabase
 */

console.log('🔵 hero-form.js loaded');

// EmailJS Configuration
const EMAILJS_PUBLIC_KEY = 'mDVai_5tMMMLPNwAH';
const EMAILJS_SERVICE_ID = 'service_lph1kb7';
const EMAILJS_TEMPLATE_ID = 'template_24tnsnn';

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBt9pptS7lOawwiN9vB7sdp5qk30pIDvOg",
  authDomain: "pristineclean-3e06f.firebaseapp.com",
  projectId: "pristineclean-3e06f",
  storageBucket: "pristineclean-3e06f.firebasestorage.app",
  messagingSenderId: "733755044806",
  appId: "1:733755044806:web:d9b1404f0622bb6bf4b8c7",
  measurementId: "G-3CD96F6J65"
};

// Global Database Variable
let db = null;

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔵 DOM loaded, initializing...');
    
    // Initialize EmailJS
    if (typeof emailjs !== 'undefined') {
        emailjs.init(EMAILJS_PUBLIC_KEY);
        console.log('✅ EmailJS initialized');
    } else {
        console.warn('⚠️ EmailJS not loaded');
    }
    
    // Initialize Firebase
    if (typeof firebase !== 'undefined') {
        try {
            console.log('🔵 Initializing Firebase...');
            firebase.initializeApp(firebaseConfig);
            db = firebase.firestore();
            console.log('✅ Firebase Firestore initialized successfully!');
        } catch (error) {
            console.error('❌ Error initializing Firebase:', error);
        }
    } else {
        console.error('❌ Firebase SDK not loaded! Check your internet connection.');
    }
    
    // Initialize form
    initializeQuoteForm();
});

/**
 * Initialize the quote form
 */
function initializeQuoteForm() {
    console.log('🔵 initializeQuoteForm called');
    const form = document.getElementById('heroQuoteForm');
    console.log('🔵 Form found:', form);
    if (!form) {
        console.error('❌ Form with id="heroQuoteForm" not found!');
        return;
    }
    
    console.log('✅ Form initialization starting...');

    // Add form submit event listener
    console.log('🔵 Adding submit event listener to form...');
    form.addEventListener('submit', handleFormSubmit);
    console.log('🔵 Submit event listener added!');

    // Add input validation
    addInputValidation();

    // Phone number formatting
    const phoneInput = document.getElementById('hero-phone');
    if (phoneInput) {
        phoneInput.addEventListener('input', formatPhoneNumber);
    }
    
    // Check if there's an active cooldown on page load
    checkCooldownStatus();
}

/**
 * Handle form submission
 */
async function handleFormSubmit(e) {
    console.log('🔵🔵🔵 FORM SUBMITTED! handleFormSubmit called');
    e.preventDefault();
    console.log('🔵 Event:', e);
    console.log('🔵 Validating form...');
    
    // Check rate limiting (60 second cooldown)
    const lastSubmit = localStorage.getItem('lastFormSubmit');
    const now = Date.now();
    const cooldownTime = 60000; // 60 seconds (1 minute)
    
    if (lastSubmit && (now - parseInt(lastSubmit)) < cooldownTime) {
        const remainingTime = Math.ceil((cooldownTime - (now - parseInt(lastSubmit))) / 1000);
        const minutes = Math.floor(remainingTime / 60);
        const seconds = remainingTime % 60;
        const timeMessage = minutes > 0 
            ? `${minutes} minute${minutes > 1 ? 's' : ''} and ${seconds} second${seconds !== 1 ? 's' : ''}`
            : `${remainingTime} second${remainingTime !== 1 ? 's' : ''}`;
        
        showToast(`⏱️ Please wait ${timeMessage} before submitting again`, 'error');
        
        // Disable submit button during cooldown
        const submitBtn = e.target.querySelector('.btn-form-submit') || e.target.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            // Preserve original text if not already saved
            if (!submitBtn.getAttribute('data-original-text')) {
                submitBtn.setAttribute('data-original-text', submitBtn.innerHTML);
            }
            const originalText = submitBtn.getAttribute('data-original-text');
            submitBtn.innerHTML = `<i class="fas fa-clock"></i> Wait ${timeMessage}`;
            
            // Re-enable button after cooldown
            setTimeout(() => {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }, (cooldownTime - (now - parseInt(lastSubmit))));
        }
        
        return;
    }

    if (!validateForm()) {
        console.log('❌ Form validation failed');
        return;
    }
    
    console.log('✅ Form validation passed');

    // Get form data
    const formData = new FormData(e.target);
    const data = {
        fullName: formData.get('fullName')?.trim(),
        phone: formData.get('phone')?.trim(),
        email: formData.get('email')?.trim(),
        city: formData.get('city')?.trim(),
        timeline: formData.get('timeline')
    };

    // Show loading state
    const submitBtn = e.target.querySelector('.btn-form-submit') || e.target.querySelector('button[type="submit"]');
    if (!submitBtn) {
        console.error('❌ Submit button not found!');
        return;
    }
    // Preserve original text if not already saved
    if (!submitBtn.getAttribute('data-original-text')) {
        submitBtn.setAttribute('data-original-text', submitBtn.innerHTML);
    }
    const originalText = submitBtn.getAttribute('data-original-text');
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    submitBtn.disabled = true;

    try {
        // Submit to Firebase
        await submitToFirebase(data);
        
        // Store timestamp for rate limiting
        localStorage.setItem('lastFormSubmit', now.toString());
        
        // Send email notification (non-blocking)
        sendEmailNotification(data).catch(err => {
            console.warn('Email notification failed:', err);
            // Don't fail the form submission if email fails
        });

        // Show success message
        showSuccessMessage();

        // Track conversion (optional)
        if (typeof gtag !== 'undefined') {
            gtag('event', 'form_submission', {
                'event_category': 'engagement',
                'event_label': 'quote_form'
            });
        }
    } catch (error) {
        console.error('Form submission error:', error);
        const errorMsg = error.message || 'Something went wrong. Please try again or call us at (437) 545-8704.';
        showErrorMessage(errorMsg);
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
        
        // Log error details for debugging
        console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    }
}

/**
 * Validate form
 */
function validateForm() {
    const fullName = document.getElementById('hero-fullName');
    const phone = document.getElementById('hero-phone');
    const email = document.getElementById('hero-email');
    const city = document.getElementById('hero-city');
    const timelineInputs = document.querySelectorAll('input[name="timeline"]');

    let isValid = true;

    // Validate full name (check if element exists)
    if (fullName) {
        if (!fullName.value.trim()) {
            showFieldError(fullName, 'Full name is required');
        isValid = false;
    } else {
            clearFieldError(fullName);
    }
    }

    // Validate phone (check if element exists)
    if (phone) {
    if (!phone.value.trim()) {
        showFieldError(phone, 'Phone number is required');
        isValid = false;
    } else if (!isValidPhone(phone.value)) {
        showFieldError(phone, 'Please enter a valid phone number');
        isValid = false;
    } else {
        clearFieldError(phone);
        }
    }

    // Validate email (check if element exists)
    if (email) {
    if (!email.value.trim()) {
        showFieldError(email, 'Email is required');
        isValid = false;
    } else if (!isValidEmail(email.value)) {
        showFieldError(email, 'Please enter a valid email');
        isValid = false;
    } else {
        clearFieldError(email);
    }
    }

    // Validate city (check if element exists)
    if (city) {
        if (!city.value.trim()) {
            showFieldError(city, 'City is required');
        isValid = false;
    } else {
            clearFieldError(city);
        }
    }

    // Validate timeline (radio buttons)
    if (timelineInputs.length > 0) {
        let timelineSelected = false;
        timelineInputs.forEach(input => {
            if (input.checked) {
                timelineSelected = true;
            }
        });
        
        if (!timelineSelected) {
            alert('Please select how soon you need cleaning');
            isValid = false;
        }
    }

    return isValid;
}

/**
 * Submit form data to Firebase Firestore
 */
async function submitToFirebase(data) {
    console.log('🔵 submitToFirebase called:', data);
    
    if (!db) {
        throw new Error('Database connection not initialized. Please refresh and try again.');
    }

    // Prepare data
    const submissionData = {
        full_name: data.fullName || `${data.firstName || ''} ${data.lastName || ''}`.trim(),
        phone: data.phone,
        email: data.email,
        city: data.city || 'Not provided',
        timeline: data.timeline,
        submitted_at: new Date().toISOString(),
        status: 'new'
    };

    console.log('🔵 Submitting data to Firestore:', submissionData);

    try {
        // Add to "quote_requests" collection
        const docRef = await db.collection("quote_requests").add(submissionData);
        console.log("✅ Document written with ID: ", docRef.id);
        return docRef;
    } catch (error) {
        console.error("❌ Error adding document: ", error);
        throw new Error('Failed to submit to database. Please try again.');
    }
}

/**
 * Send email notification using EmailJS
 */
async function sendEmailNotification(data) {
    console.log('📧 Sending email notification...');
    
    if (typeof emailjs === 'undefined') {
        console.warn('⚠️ EmailJS not available, skipping email notification');
        return;
    }
    
    if (EMAILJS_PUBLIC_KEY === 'YOUR_EMAILJS_PUBLIC_KEY') {
        console.warn('⚠️ EmailJS not configured, skipping email notification');
        return;
    }
    
    const templateParams = {
        to_email: 'contact@pristineandclean.ca',
        from_name: data.fullName,
        customer_name: data.fullName,
        customer_email: data.email,
        customer_phone: data.phone,
        customer_city: data.city,
        timeline: data.timeline,
        submitted_at: new Date().toLocaleString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    };
    
    try {
        const response = await emailjs.send(
            EMAILJS_SERVICE_ID,
            EMAILJS_TEMPLATE_ID,
            templateParams
        );
        console.log('✅ Email sent successfully:', response);
        return response;
    } catch (error) {
        console.error('❌ Email send failed:', error);
        throw error;
    }
}

/**
 * Show success message
 */
function showSuccessMessage() {
    console.log('✅ Showing success message...');
    const form = document.getElementById('heroQuoteForm');
    const successMessage = document.getElementById('formSuccess');

    if (!form) {
        console.error('❌ Form not found!');
        return;
    }

    if (!successMessage) {
        console.error('❌ Success message element not found!');
        return;
    }

    // Hide form slides
    const formSlides = form.querySelectorAll('.form-slide');
    formSlides.forEach(slide => {
        slide.style.display = 'none';
    });

    // Hide form title if it exists (check both inside form and parent container)
    const formTitle = form.querySelector('.form-title') || form.closest('.booking-form-container')?.querySelector('.form-title');
    if (formTitle) {
        formTitle.style.display = 'none';
    }

    // Show success message with animation
    successMessage.style.display = 'block';
    successMessage.classList.add('active');
    
    // Force reflow to trigger animation
    void successMessage.offsetHeight;
    
    // Always hide the "Submit Another Request" button
    const resetButton = successMessage.querySelector('button');
    if (resetButton) {
        resetButton.style.display = 'none';
    }

    // NO TOAST - User doesn't want it

    // Scroll to success message on mobile
    if (window.innerWidth <= 768) {
        setTimeout(() => {
            successMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    }
    
    console.log('✅ Success message displayed!');
}

/**
 * Show toast notification
 */
function showToast(message, type = 'success') {
    // Remove any existing toasts
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) {
        existingToast.remove();
    }

    // Create toast
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.innerHTML = `
        <i class="fas fa-check-circle"></i>
        <span>${message}</span>
    `;

    // Add to page
    document.body.appendChild(toast);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

/**
 * Show toast with live countdown timer
 */
function showToastWithCountdown() {
    // Remove any existing toasts
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) {
        existingToast.remove();
    }

    // Create toast
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.innerHTML = `
        <i class="fas fa-check-circle" style="margin-right: 8px; font-size: 1.2em;"></i>
        <span id="toast-message">✅ Submitted! Wait <strong style="font-size: 1.1em; color: #fef3c7;">60s</strong> before submitting again</span>
    `;

    // Add to page
    document.body.appendChild(toast);

    // Live countdown
    let timeLeft = 60;
    const countdownInterval = setInterval(() => {
        timeLeft--;
        const messageSpan = toast.querySelector('#toast-message');
        if (messageSpan && timeLeft >= 0) {
            messageSpan.innerHTML = `✅ Submitted! Wait <strong style="font-size: 1.1em; color: #fef3c7;">${timeLeft}s</strong> before submitting again`;
        }
        if (timeLeft <= 0) {
            clearInterval(countdownInterval);
            if (messageSpan) {
                messageSpan.innerHTML = `✅ You can submit again now! Refresh the page.`;
            }
        }
    }, 1000);

    // Remove after 65 seconds (give them time to see the final message)
    setTimeout(() => {
        clearInterval(countdownInterval);
        toast.style.animation = 'slideDown 0.4s ease-in';
        setTimeout(() => toast.remove(), 400);
    }, 65000);
}

/**
 * Show error message
 */
function showErrorMessage(message) {
    // Remove any existing error toasts
    const existingToast = document.querySelector('.toast-notification-error');
    if (existingToast) {
        existingToast.remove();
    }

    // Create error toast
    const toast = document.createElement('div');
    toast.className = 'toast-notification-error';
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #dc3545;
        color: white;
        padding: 16px 24px;
        border-radius: 10px;
        box-shadow: 0 4px 20px rgba(220, 53, 69, 0.4);
        z-index: 10000;
        max-width: 90%;
        text-align: center;
        font-weight: 600;
        animation: slideUp 0.3s ease-out;
    `;
    toast.innerHTML = `
        <i class="fas fa-exclamation-circle" style="margin-right: 8px;"></i>
        <span>${message}</span>
    `;

    // Add to page
    document.body.appendChild(toast);

    // Remove after 8 seconds
    setTimeout(() => {
        toast.style.animation = 'slideDown 0.3s ease-in';
        setTimeout(() => toast.remove(), 300);
    }, 8000);
    
    // Also show alert as backup
    alert(message);
}

/**
 * Reset quote form
 */
function resetQuoteForm() {
    const form = document.getElementById('heroQuoteForm');
    const successMessage = document.getElementById('formSuccess');

    if (!form) return;

    // Reset form
    form.reset();

    // Hide success message
    if (successMessage) {
        successMessage.classList.remove('active');
        successMessage.style.display = 'none';
    }

    // Show slide 1, hide slide 2
    const slide1 = document.getElementById('slide1');
    const slide2 = document.getElementById('slide2');
    if (slide1) slide1.style.display = 'block';
    if (slide2) slide2.style.display = 'none';

    // Reset form title
    const formTitle = document.querySelector('.form-title');
    if (formTitle) {
        formTitle.textContent = 'How can we reach out to you?';
        formTitle.style.display = '';
    }

    // Clear all errors
    const inputs = form.querySelectorAll('input, select');
    inputs.forEach(input => clearFieldError(input));

    // Scroll to form
    if (window.innerWidth <= 768) {
        setTimeout(() => {
            form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }
}

/**
 * Add input validation
 */
function addInputValidation() {
    const inputs = document.querySelectorAll('#heroQuoteForm input, #heroQuoteForm select');
    inputs.forEach(input => {
        input.addEventListener('blur', function() {
            if (this.required && !this.value.trim()) {
                showFieldError(this, 'This field is required');
            } else if (this.type === 'email' && this.value && !isValidEmail(this.value)) {
                showFieldError(this, 'Please enter a valid email');
            } else if (this.type === 'tel' && this.value && !isValidPhone(this.value)) {
                showFieldError(this, 'Please enter a valid phone number');
            } else {
                clearFieldError(this);
            }
        });

        input.addEventListener('input', function() {
            if (this.value.trim()) {
                clearFieldError(this);
            }
        });

        input.addEventListener('change', function() {
            if (this.value) {
                clearFieldError(this);
            }
        });
    });
}

/**
 * Show field error
 */
function showFieldError(input, message) {
    clearFieldError(input);

    input.classList.add('error');
    input.style.borderColor = '#dc3545';
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'field-error';
    errorDiv.textContent = message;

    input.parentElement.appendChild(errorDiv);
}

/**
 * Clear field error
 */
function clearFieldError(input) {
    input.classList.remove('error');
    input.style.borderColor = '';

    const errorDiv = input.parentElement.querySelector('.field-error');
    if (errorDiv) {
        errorDiv.remove();
    }
}

/**
 * Validate email
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Validate phone
 */
function isValidPhone(phone) {
    const phoneDigits = phone.replace(/\D/g, '');
    return phoneDigits.length >= 10;
}

/**
 * Check cooldown status on page load with LIVE countdown
 */
function checkCooldownStatus() {
    const form = document.getElementById('heroQuoteForm');
    if (!form) return;
    
    const submitBtn = form.querySelector('.btn-form-submit') || form.querySelector('button[type="submit"]');
    if (!submitBtn) return;
    
    const lastSubmit = localStorage.getItem('lastFormSubmit');
    if (!lastSubmit) return;
    
    const now = Date.now();
    const cooldownTime = 60000; // 60 seconds
    const timeElapsed = now - parseInt(lastSubmit);
    
    if (timeElapsed < cooldownTime) {
        submitBtn.disabled = true;
        const originalText = submitBtn.getAttribute('data-original-text') || submitBtn.innerHTML;
        submitBtn.setAttribute('data-original-text', originalText);
        
        let remainingMs = cooldownTime - timeElapsed;
        
        // Update button text every second with LIVE countdown
        const countdownInterval = setInterval(() => {
            remainingMs -= 1000;
            const remainingSeconds = Math.ceil(remainingMs / 1000);
            
            if (remainingSeconds <= 0) {
                clearInterval(countdownInterval);
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
            submitBtn.removeAttribute('data-original-text');
            } else {
                submitBtn.innerHTML = `<i class="fas fa-clock"></i> Wait ${remainingSeconds}s`;
            }
        }, 1000);
        
        // Initial display
        const initialSeconds = Math.ceil(remainingMs / 1000);
        submitBtn.innerHTML = `<i class="fas fa-clock"></i> Wait ${initialSeconds}s`;
    }
}

/**
 * Format phone number
 */
function formatPhoneNumber(e) {
    const input = e.target;
    const phoneDigits = input.value.replace(/\D/g, '');
    
    if (phoneDigits.length <= 3) {
        input.value = phoneDigits;
    } else if (phoneDigits.length <= 6) {
        input.value = `(${phoneDigits.slice(0, 3)}) ${phoneDigits.slice(3)}`;
    } else if (phoneDigits.length <= 10) {
        input.value = `(${phoneDigits.slice(0, 3)}) ${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}`;
    } else {
        input.value = `(${phoneDigits.slice(0, 3)}) ${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6, 10)}`;
    }
}

// Make functions available globally
window.resetQuoteForm = resetQuoteForm;
