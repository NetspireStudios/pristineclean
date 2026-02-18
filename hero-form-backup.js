/**
 * Quote Form - Single Page Form with Supabase Integration
 * Handles form validation and submission to Supabase
 */

console.log('ðŸ”µ hero-form.js loaded');

// EmailJS Configuration
const EMAILJS_PUBLIC_KEY = 'mDVai_5tMMMLPNwAH';
const EMAILJS_SERVICE_ID = 'service_lph1kb7';
const EMAILJS_TEMPLATE_ID = 'template_24tnsnn';

// Supabase Configuration
const SUPABASE_URL = 'https://beqjprowrjkuvtdrjize.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlcWpwcm93cmprdXZ0ZHJqaXplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyNjQwMDcsImV4cCI6MjA4MTg0MDAwN30.NAEGtnyf_-Cl8_t77kllf7W1R1AMrczJyaohiM5GfRU';

// Global Supabase client variable
var supabaseClient = null;

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {
    console.log('ðŸ”µ DOM loaded, initializing...');
    
    // Initialize EmailJS
    if (typeof emailjs !== 'undefined') {
        emailjs.init(EMAILJS_PUBLIC_KEY);
        console.log('âœ… EmailJS initialized');
    } else {
        console.warn('âš ï¸ EmailJS not loaded');
    }
    
    // Initialize Supabase
    console.log('ðŸ”µ Checking for window.supabase:', typeof window.supabase);
    
    if (typeof window.supabase !== 'undefined') {
        try {
            console.log('ðŸ”µ Creating Supabase client...');
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log('âœ… Supabase client created:', supabaseClient);
            console.log('âœ… Supabase initialized successfully!');
        } catch (error) {
            console.error('âŒ Error creating Supabase client:', error);
        }
    } else {
        console.error('âŒ window.supabase is undefined! CDN not loaded.');
    }
    
    // Initialize form
    initializeQuoteForm();
});

/**
 * Initialize the quote form
 */
function initializeQuoteForm() {
    console.log('ðŸ”µ initializeQuoteForm called');
    const form = document.getElementById('heroQuoteForm');
    console.log('ðŸ”µ Form found:', form);
    if (!form) {
        console.error('âŒ Form with id="heroQuoteForm" not found!');
        return;
    }
    
    console.log('âœ… Form initialization starting...');

    // Add form submit event listener
    console.log('ðŸ”µ Adding submit event listener to form...');
    form.addEventListener('submit', handleFormSubmit);
    console.log('ðŸ”µ Submit event listener added!');

    // Add input validation
    addInputValidation();

    // Phone number formatting
    const phoneInput = document.getElementById('hero-phone');
    if (phoneInput) {
        phoneInput.addEventListener('input', formatPhoneNumber);
    }
}

/**
 * Handle form submission
 */
async function handleFormSubmit(e) {
    console.log('ðŸ”µðŸ”µðŸ”µ FORM SUBMITTED! handleFormSubmit called');
    e.preventDefault();
    console.log('ðŸ”µ Event:', e);
    console.log('ðŸ”µ Validating form...');
    
    // Check rate limiting (60 second cooldown)
    const lastSubmit = localStorage.getItem('lastFormSubmit');
    const now = Date.now();
    const cooldownTime = 60000; // 60 seconds
    
    if (lastSubmit && (now - parseInt(lastSubmit)) < cooldownTime) {
        const remainingTime = Math.ceil((cooldownTime - (now - parseInt(lastSubmit))) / 1000);
        showToast(`â±ï¸ Please wait ${remainingTime} seconds before submitting again`, 'error');
        return;
    }

    if (!validateForm()) {
        console.log('âŒ Form validation failed');
        return;
    }
    
    console.log('âœ… Form validation passed');

    // Get form data
    const formData = new FormData(e.target);
    const data = {
        firstName: formData.get('firstName')?.trim(),
        lastName: formData.get('lastName')?.trim(),
        phone: formData.get('phone')?.trim(),
        email: formData.get('email')?.trim(),
        timeline: formData.get('timeline')
    };

    // Show loading state
    const submitBtn = e.target.querySelector('.btn-form-submit');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    submitBtn.disabled = true;

    try {
        // Submit to Supabase
        await submitToSupabase(data);
        
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
        showErrorMessage('Something went wrong. Please try again or call us at (437) 545-8704.');
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

/**
 * Validate form
 */
function validateForm() {
    const firstName = document.getElementById('hero-firstName');
    const lastName = document.getElementById('hero-lastName');
    const phone = document.getElementById('hero-phone');
    const email = document.getElementById('hero-email');
    const timeline = document.getElementById('hero-timeline');

    let isValid = true;

    // Validate first name
    if (!firstName.value.trim()) {
        showFieldError(firstName, 'First name is required');
        isValid = false;
    } else {
        clearFieldError(firstName);
    }

    // Validate last name
    if (!lastName.value.trim()) {
        showFieldError(lastName, 'Last name is required');
        isValid = false;
    } else {
        clearFieldError(lastName);
    }

    // Validate phone
    if (!phone.value.trim()) {
        showFieldError(phone, 'Phone number is required');
        isValid = false;
    } else if (!isValidPhone(phone.value)) {
        showFieldError(phone, 'Please enter a valid phone number');
        isValid = false;
    } else {
        clearFieldError(phone);
    }

    // Validate email
    if (!email.value.trim()) {
        showFieldError(email, 'Email is required');
        isValid = false;
    } else if (!isValidEmail(email.value)) {
        showFieldError(email, 'Please enter a valid email');
        isValid = false;
    } else {
        clearFieldError(email);
    }

    // Validate timeline
    if (!timeline.value) {
        showFieldError(timeline, 'Please select a timeline');
        isValid = false;
    } else {
        clearFieldError(timeline);
    }

    return isValid;
}

/**
 * Submit form data to Supabase
 */
async function submitToSupabase(data) {
    console.log('ðŸ”µ submitToSupabase called:', data);
    
    if (!supabaseClient) {
        console.error('âŒ Supabase client not initialized!');
        console.log('SUPABASE_URL:', SUPABASE_URL);
        console.log('SUPABASE_ANON_KEY exists:', !!SUPABASE_ANON_KEY);
        throw new Error('Database connection not initialized. Please refresh the page and try again.');
    }

    // Prepare data for Supabase
    const submissionData = {
        first_name: data.firstName,
        last_name: data.lastName,
        phone: data.phone,
        email: data.email,
        timeline: data.timeline,
        submitted_at: new Date().toISOString(),
        status: 'new'
    };

    console.log('ðŸ”µ Submitting data:', submissionData);

    // Insert into Supabase
    const { data: result, error } = await supabaseClient
        .from('quote_requests')
        .insert([submissionData]);

    if (error) {
        console.error('âŒ Supabase error:', error);
        throw new Error(error.message || 'Failed to submit. Please try again.');
    }

    console.log('âœ… Success! Data submitted:', result);
    return result;
}

/**
 * Send email notification using EmailJS
 */
async function sendEmailNotification(data) {
    console.log('ðŸ“§ Sending email notification...');
    
    if (typeof emailjs === 'undefined') {
        console.warn('âš ï¸ EmailJS not available, skipping email notification');
        return;
    }
    
    if (EMAILJS_PUBLIC_KEY === 'YOUR_EMAILJS_PUBLIC_KEY') {
        console.warn('âš ï¸ EmailJS not configured, skipping email notification');
        return;
    }
    
    const templateParams = {
        to_email: 'contact@pristineandclean.ca',
        from_name: `${data.firstName} ${data.lastName}`,
        customer_name: `${data.firstName} ${data.lastName}`,
        customer_email: data.email,
        customer_phone: data.phone,
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
        console.log('âœ… Email sent successfully:', response);
        return response;
    } catch (error) {
        console.error('âŒ Email send failed:', error);
        throw error;
    }
}

/**
 * Show success message
 */
function showSuccessMessage() {
    const form = document.getElementById('heroQuoteForm');
    const successMessage = document.getElementById('formSuccess');

    if (form && successMessage) {
        // Hide form fields
        const formFields = form.querySelectorAll('.form-row, .form-group, .btn-form-submit, .form-title');
        formFields.forEach(field => field.style.display = 'none');

        // Show success message
        successMessage.classList.add('active');
        
        // Hide the "Submit Another Request" button
        const resetButton = successMessage.querySelector('button');
        if (resetButton) {
            resetButton.style.display = 'none';
        }

        // Show toast notification
        showToast('âœ“ Submitted Successfully! Refresh to submit again.', 'success');

        // Scroll to success message on mobile
        if (window.innerWidth <= 768) {
            setTimeout(() => {
                successMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        }
    }
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
 * Show error message
 */
function showErrorMessage(message) {
    showToast(message, 'error');
    alert(message); // Fallback
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
    }

    // Show form fields
    const formFields = form.querySelectorAll('.form-row, .form-group, .btn-form-submit, .form-title');
    formFields.forEach(field => field.style.display = '');

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

