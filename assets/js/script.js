/**
 * Pristine & Clean Website - Interactive Features & Mobile Optimization
 * Author: Pristine & Clean Development Team
 * Version: 2.0
 * Last Updated: 2024-12-19
 * 
 * Features:
 * - Mobile-first responsive navigation
 * - Touch-optimized interactions
 * - Accessibility enhancements
 * - Performance optimizations
 * - Blog search and filtering
 * - Smooth animations and transitions
 */

// Performance optimization: Preload critical resources
// TEMPORARILY DISABLED SERVICE WORKER TO FIX CACHING ISSUE
// Unregister any existing service workers
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for(let registration of registrations) {
            registration.unregister();
            console.log('Service worker unregistered');
        }
    });
}
/*
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js')
            .then(function(registration) {
                console.log('SW registered: ', registration);
            })
            .catch(function(registrationError) {
                console.log('SW registration failed: ', registrationError);
            });
    });
}
*/

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    
    // Clean Mobile Menu Toggle
    const mobileMenuTrigger = document.getElementById('mobile-menu-trigger');
    const navMenu = document.getElementById('nav-menu');
    const navBackdrop = document.getElementById('nav-backdrop');
    
    if (mobileMenuTrigger && navMenu) {
        // Set initial ARIA state
        mobileMenuTrigger.setAttribute('aria-expanded', 'false');
        navMenu.setAttribute('aria-hidden', 'true');
        
        function openMenu() {
            mobileMenuTrigger.setAttribute('aria-expanded', 'true');
            navMenu.setAttribute('aria-hidden', 'false');
            navMenu.classList.add('active');
            mobileMenuTrigger.classList.add('active');
            document.body.style.overflow = 'hidden';
            document.body.style.position = 'fixed';
            document.body.style.width = '100%';
            document.body.style.top = `-${window.scrollY}px`;
        }
        
        function closeMenu() {
            mobileMenuTrigger.setAttribute('aria-expanded', 'false');
            navMenu.setAttribute('aria-hidden', 'true');
            navMenu.classList.remove('active');
            mobileMenuTrigger.classList.remove('active');
            document.body.style.overflow = '';
            document.body.style.position = '';
            document.body.style.width = '';
            document.body.style.top = '';
            
            // Close any open dropdowns
            const activeDropdowns = document.querySelectorAll('.nav-item.dropdown.active');
            activeDropdowns.forEach(dropdown => {
                dropdown.classList.remove('active');
            });
        }
        
        // Open/close menu on trigger click
        mobileMenuTrigger.addEventListener('click', function() {
            if (navMenu.classList.contains('active')) {
                closeMenu();
            } else {
                openMenu();
            }
        });
        
        // Close menu on escape key
        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape' && navMenu.classList.contains('active')) {
                closeMenu();
                mobileMenuTrigger.focus();
            }
        });
        
        // Close menu when clicking on nav links (except dropdown links and services link)
        const navLinks = document.querySelectorAll('.nav-link:not(.dropdown-link):not([href*="services"])');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                closeMenu();
            });
        });
        
        // Mobile Services Dropdown Functionality
        const dropdownItems = document.querySelectorAll('.nav-item.dropdown');
        dropdownItems.forEach(item => {
            const dropdownLink = item.querySelector('.nav-link');
            
            if (dropdownLink) {
                dropdownLink.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const isCurrentlyOpen = item.classList.contains('active');
                    
                    // Close all other dropdowns first
                    dropdownItems.forEach(otherItem => {
                        if (otherItem !== item) {
                            otherItem.classList.remove('active');
                        }
                    });
                    
                    // Toggle current dropdown
                    if (isCurrentlyOpen) {
                        item.classList.remove('active');
                    } else {
                        item.classList.add('active');
                    }
                });
            }
        });
        
        // Handle dropdown link clicks - close menu and navigate
        const dropdownLinks = document.querySelectorAll('.dropdown-link');
        dropdownLinks.forEach(link => {
            link.addEventListener('click', function(e) {
                // Close the main menu when clicking dropdown items
                closeMenu();
            });
        });
        
        // Close dropdowns when clicking outside the dropdown area
        document.addEventListener('click', function(event) {
            if (!event.target.closest('.nav-item.dropdown')) {
                dropdownItems.forEach(dropdown => {
                    dropdown.classList.remove('active');
                });
            }
        });
    }

    // Mobile-specific touch enhancements
    function addTouchFeedback() {
        const touchElements = document.querySelectorAll('.btn, .blog-read-more, .banner-cta, .nav-link, .dropdown-link');
        
        touchElements.forEach(element => {
            element.addEventListener('touchstart', function() {
                this.style.transform = 'scale(0.98)';
                this.style.opacity = '0.9';
            });
            
            element.addEventListener('touchend', function() {
                setTimeout(() => {
                    this.style.transform = '';
                    this.style.opacity = '';
                }, 150);
            });
            
            element.addEventListener('touchcancel', function() {
                this.style.transform = '';
                this.style.opacity = '';
            });
        });
    }

    // Mobile viewport height adjustment for iOS Safari
    function setMobileViewportHeight() {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }

    // Mobile device detection and optimizations
    function mobileOptimizations() {
        const isMobile = window.innerWidth <= 768;
        const isTouch = 'ontouchstart' in window;
        
        if (isMobile) {
            // Add mobile class to body
            document.body.classList.add('mobile-device');
            
            // Optimize scrolling performance
            document.body.style.webkitOverflowScrolling = 'touch';
            
            // Add touch feedback
            addTouchFeedback();
            
            // Set mobile viewport height
            setMobileViewportHeight();
            
            // Prevent zoom on double tap for iOS
            let lastTouchEnd = 0;
            document.addEventListener('touchend', function (event) {
                const now = (new Date()).getTime();
                if (now - lastTouchEnd <= 300) {
                    event.preventDefault();
                }
                lastTouchEnd = now;
            }, false);
        }
        
        if (isTouch) {
            document.body.classList.add('touch-device');
        }
    }

    // Mobile form enhancements
    function enhanceMobileForms() {
        const inputs = document.querySelectorAll('input, textarea, select');
        
        inputs.forEach(input => {
            // Prevent zoom on focus for iOS
            if (input.type !== 'file') {
                input.addEventListener('focus', function() {
                    this.style.fontSize = '16px';
                });
                
                input.addEventListener('blur', function() {
                    this.style.fontSize = '';
                });
            }
            
            // Add better mobile keyboard support
            if (input.type === 'email') {
                input.setAttribute('inputmode', 'email');
            } else if (input.type === 'tel') {
                input.setAttribute('inputmode', 'tel');
            } else if (input.type === 'url') {
                input.setAttribute('inputmode', 'url');
            }
        });
    }

    // Initialize mobile optimizations
    mobileOptimizations();
    enhanceMobileForms();

    // Re-run optimizations on resize
    window.addEventListener('resize', () => {
        setMobileViewportHeight();
        mobileOptimizations();
    });

    // Re-run on orientation change
    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            setMobileViewportHeight();
            mobileOptimizations();
        }, 100);
    });

    // Close dropdowns when clicking outside (only for mobile menu)
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.nav-menu') && !e.target.closest('.nav-toggle')) {
            const dropdowns = document.querySelectorAll('.nav-item.dropdown');
            dropdowns.forEach(dropdown => {
                const dropdownMenu = dropdown.querySelector('.dropdown-menu');
                dropdown.classList.remove('active');
                if (dropdownMenu) {
                    dropdownMenu.classList.remove('active');
                }
            });
        }
    });
    
    // Smooth scrolling for anchor links
    const anchorLinks = document.querySelectorAll('a[href^="#"]');
    anchorLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            const targetId = this.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);
            
            if (targetElement) {
                e.preventDefault();
                const offsetTop = targetElement.offsetTop - 70; // Account for fixed navbar
                
                window.scrollTo({
                    top: offsetTop,
                    behavior: 'smooth'
                });
            }
        });
    });
    
    // Navbar background on scroll
    const navbar = document.querySelector('.navbar');
    if (navbar) {
        window.addEventListener('scroll', function() {
            if (window.scrollY > 50) {
                navbar.style.background = 'rgba(255, 255, 255, 0.98)';
            } else {
                navbar.style.background = 'rgba(255, 255, 255, 0.95)';
            }
        });
    }
    
    // Active navigation highlighting
    const sections = document.querySelectorAll('section[id]');
    const navLinksForHighlight = document.querySelectorAll('.nav-link[href^="#"]');
    
    function highlightNavigation() {
        const scrollPosition = window.scrollY + 100;
        
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.offsetHeight;
            const sectionId = section.getAttribute('id');
            
            if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
                navLinksForHighlight.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === `#${sectionId}`) {
                        link.classList.add('active');
                    }
                });
            }
        });
    }
    
    window.addEventListener('scroll', highlightNavigation);
    
    // Contact form handling
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Get form data
            const formData = new FormData(contactForm);
            const formObject = {};
            
            // Convert FormData to object
            for (let [key, value] of formData.entries()) {
                formObject[key] = value;
            }
            
            // Basic validation
            const requiredFields = ['firstName', 'lastName', 'email', 'phone', 'address', 'service'];
            let isValid = true;
            
            requiredFields.forEach(field => {
                const input = document.getElementById(field);
                if (!formObject[field] || formObject[field].trim() === '') {
                    input.style.borderColor = '#ff4757';
                    isValid = false;
                } else {
                    input.style.borderColor = '#e9ecef';
                }
            });
            
            // Email validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const emailInput = document.getElementById('email');
            if (!emailRegex.test(formObject.email)) {
                emailInput.style.borderColor = '#ff4757';
                isValid = false;
            }
            
            if (isValid) {
                // Show success message
                showFormMessage('Thank you! Your booking request has been submitted. We\'ll contact you within 24 hours to confirm your appointment.', 'success');
                
                // Reset form
                contactForm.reset();
                
                // In a real application, you would send this data to your server
                console.log('Form submitted with data:', formObject);
            } else {
                showFormMessage('Please fill in all required fields correctly.', 'error');
            }
        });
    }
    
    // Show form message function
    function showFormMessage(message, type) {
        // Remove existing message if any
        const existingMessage = document.querySelector('.form-message');
        if (existingMessage) {
            existingMessage.remove();
        }
        
        // Create message element
        const messageElement = document.createElement('div');
        messageElement.className = `form-message ${type}`;
        messageElement.textContent = message;
        
        // Style the message
        messageElement.style.cssText = `
            padding: 15px 20px;
            margin: 20px 0;
            border-radius: 8px;
            font-weight: 500;
            text-align: center;
            ${type === 'success' 
                ? 'background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb;' 
                : 'background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb;'
            }
        `;
        
        // Insert message after form
        contactForm.insertAdjacentElement('afterend', messageElement);
        
        // Auto remove message after 5 seconds
        setTimeout(() => {
            if (messageElement) {
                messageElement.remove();
            }
        }, 5000);
        
        // Scroll to message
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    // Service type and frequency interaction
    const serviceSelect = document.getElementById('service');
    const frequencySelect = document.getElementById('frequency');
    
    if (serviceSelect && frequencySelect) {
        serviceSelect.addEventListener('change', function() {
            const selectedService = this.value;
            
            // Reset frequency options
            frequencySelect.innerHTML = '<option value="">Select frequency</option>';
            
            if (selectedService === 'standard') {
                frequencySelect.innerHTML += `
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Bi-weekly</option>
                    <option value="monthly">Monthly</option>
                `;
            } else if (selectedService === 'vacation') {
                frequencySelect.innerHTML += `
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Bi-weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="asneeded">As Needed</option>
                `;
            } else if (selectedService === 'deep' || selectedService === 'move') {
                frequencySelect.innerHTML += '<option value="onetime">One-time only</option>';
                frequencySelect.value = 'onetime';
            }
        });
    }
    
    // Animate elements on scroll
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);
    
    // Observe service cards and testimonial cards
    const animatedElements = document.querySelectorAll('.service-card, .testimonial-card, .feature, .faq-item');
    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
    
    // Set minimum date for preferred date input to today
    const preferredDateInput = document.getElementById('preferredDate');
    if (preferredDateInput) {
        const today = new Date().toISOString().split('T')[0];
        preferredDateInput.setAttribute('min', today);
    }
    
    // Auto-resize textarea
    const textareas = document.querySelectorAll('textarea');
    textareas.forEach(textarea => {
        textarea.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = this.scrollHeight + 'px';
        });
    });
    
    // Add loading states to buttons
    const buttons = document.querySelectorAll('.btn');
    buttons.forEach(button => {
        if (button.type === 'submit') {
            button.addEventListener('click', function() {
                const originalText = this.textContent;
                this.textContent = 'Processing...';
                this.disabled = true;
                
                // Re-enable after 3 seconds (for demo purposes)
                setTimeout(() => {
                    this.textContent = originalText;
                    this.disabled = false;
                }, 3000);
            });
        }
    });
});

// Utility function to handle phone number formatting
function formatPhoneNumber(input) {
    const phoneNumber = input.value.replace(/\D/g, '');
    const formattedNumber = phoneNumber.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
    
    if (phoneNumber.length === 10) {
        input.value = formattedNumber;
    }
}

// Add phone number formatting to phone input
document.addEventListener('DOMContentLoaded', function() {
    const phoneInput = document.getElementById('phone');
    if (phoneInput) {
        phoneInput.addEventListener('input', function() {
            formatPhoneNumber(this);
        });
    }

    // Blog Search and Filter Functionality
    const blogSearch = document.getElementById('blog-search');
    const searchBtn = document.getElementById('search-btn');
    const blogGrid = document.getElementById('blog-grid');
    const searchResults = document.getElementById('search-results');
    const resultsCount = document.getElementById('results-count');
    const filterButtons = document.querySelectorAll('.filter-btn');

    if (blogSearch && blogGrid) {
        let allBlogCards = Array.from(blogGrid.querySelectorAll('.blog-card'));
        
        // Search functionality
        function performSearch() {
            const searchTerm = blogSearch.value.toLowerCase().trim();
            const activeFilter = document.querySelector('.filter-btn.active').dataset.category;
            
            let filteredCards = allBlogCards.filter(card => {
                // Category filter
                let matchesCategory = activeFilter === 'all' || 
                    card.dataset.category.split(' ').includes(activeFilter);
                
                // Text search
                let matchesSearch = true;
                if (searchTerm) {
                    const cardText = [
                        card.querySelector('h3').textContent,
                        card.querySelector('.blog-excerpt').textContent,
                        card.querySelector('.blog-category').textContent
                    ].join(' ').toLowerCase();
                    
                    matchesSearch = cardText.includes(searchTerm);
                }
                
                return matchesCategory && matchesSearch;
            });
            
            // Show/hide cards
            allBlogCards.forEach(card => {
                if (filteredCards.includes(card)) {
                    card.classList.remove('hidden');
                } else {
                    card.classList.add('hidden');
                }
            });
            
            // Update search results
            updateSearchResults(filteredCards.length, searchTerm, activeFilter);
        }
        
        function updateSearchResults(count, searchTerm, filter) {
            if (searchTerm || filter !== 'all') {
                searchResults.style.display = 'block';
                let message = `Found ${count} post${count !== 1 ? 's' : ''}`;
                
                if (searchTerm && filter !== 'all') {
                    message += ` for "${searchTerm}" in ${filter}`;
                } else if (searchTerm) {
                    message += ` for "${searchTerm}"`;
                } else if (filter !== 'all') {
                    message += ` in ${filter} category`;
                }
                
                resultsCount.textContent = message;
                
                // Show no results message if needed
                if (count === 0) {
                    showNoResults(searchTerm, filter);
                } else {
                    hideNoResults();
                }
            } else {
                searchResults.style.display = 'none';
                hideNoResults();
            }
        }
        
        function showNoResults(searchTerm, filter) {
            let existingNoResults = document.querySelector('.no-results');
            if (existingNoResults) {
                existingNoResults.remove();
            }
            
            const noResultsDiv = document.createElement('div');
            noResultsDiv.className = 'no-results';
            noResultsDiv.innerHTML = `
                <i class="fas fa-search"></i>
                <h3>No Results Found</h3>
                <p>We couldn't find any blog posts matching your search${searchTerm ? ` for "${searchTerm}"` : ''}${filter !== 'all' ? ` in ${filter} category` : ''}.</p>
                <button class="clear-search" onclick="clearSearch()">Clear Search</button>
            `;
            
            blogGrid.appendChild(noResultsDiv);
        }
        
        function hideNoResults() {
            const noResults = document.querySelector('.no-results');
            if (noResults) {
                noResults.remove();
            }
        }
        
        // Clear search function
        window.clearSearch = function() {
            blogSearch.value = '';
            document.querySelector('.filter-btn[data-category="all"]').click();
        };
        
        // Event listeners
        searchBtn.addEventListener('click', performSearch);
        blogSearch.addEventListener('keyup', function(e) {
            if (e.key === 'Enter') {
                performSearch();
            } else {
                // Debounce search for real-time results
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(performSearch, 300);
            }
        });
        
        // Filter button functionality
        filterButtons.forEach(button => {
            button.addEventListener('click', function() {
                // Update active filter
                filterButtons.forEach(btn => btn.classList.remove('active'));
                this.classList.add('active');
                
                // Perform search with new filter
                performSearch();
            });
        });
        
        // Initialize search on page load
        performSearch();
    }

    // Enhanced Navbar Scroll Behavior
    let lastScrollTop = 0;
    let scrollTimer = null;
    let isScrolling = false;
    const navbar = document.querySelector('.navbar');
    
    if (navbar) {
        // Initially show navbar
        navbar.classList.add('navbar-visible');
        
        window.addEventListener('scroll', function() {
            const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
            const scrollDifference = Math.abs(currentScroll - lastScrollTop);
            
            // Clear the previous timer
            if (scrollTimer) {
                clearTimeout(scrollTimer);
            }
            
            // Mark as scrolling
            isScrolling = true;
            
            // Always show navbar at the very top
            if (currentScroll <= 50) {
                navbar.classList.remove('navbar-hidden');
                navbar.classList.add('navbar-visible');
            }
            // Only hide/show if significant scroll movement (prevents jittery behavior)
            else if (scrollDifference > 5) {
                if (currentScroll > lastScrollTop && currentScroll > 150) {
                    // Scrolling down and past threshold - hide navbar
                    navbar.classList.remove('navbar-visible');
                    navbar.classList.add('navbar-hidden');
                } else if (currentScroll < lastScrollTop) {
                    // Scrolling up - show navbar
                    navbar.classList.remove('navbar-hidden');
                    navbar.classList.add('navbar-visible');
                }
            }
            
            // Show navbar when user stops scrolling (but not at very top)
            scrollTimer = setTimeout(function() {
                isScrolling = false;
                if (currentScroll > 50) {
                    navbar.classList.remove('navbar-hidden');
                    navbar.classList.add('navbar-visible');
                }
            }, 300); // Increased delay for better UX
            
            lastScrollTop = currentScroll <= 0 ? 0 : currentScroll;
        }, { passive: true });
    }

    // Hero Video Background - No additional JavaScript needed
    // Video will auto-play due to HTML attributes

    // Process Slider Functionality
    let currentSlideIndex = 0;
    const processSlides = document.querySelectorAll('.process-slide');
    const processDots = document.querySelectorAll('.slider-dots .dot');
    let isTransitioning = false;
    
    // Initialize slider
    function initProcessSlider() {
        if (processSlides.length > 0) {
            // Reset all slides
            processSlides.forEach((slide, index) => {
                slide.classList.remove('active', 'prev', 'next');
                if (index === 0) {
                    slide.classList.add('active');
                } else {
                    slide.classList.add('next');
                }
            });
            
            // Set first dot as active
            if (processDots.length > 0) {
                processDots.forEach(dot => dot.classList.remove('active'));
                processDots[0].classList.add('active');
            }
            
            currentSlideIndex = 0;
        }
    }
    
    // Show specific slide
    function showSlide(index) {
        if (isTransitioning || !processSlides[index]) return;
        
        isTransitioning = true;
        
        // Remove all classes from all slides
        processSlides.forEach(slide => {
            slide.classList.remove('active', 'prev', 'next');
        });
        
        // Set up slides based on the target index
        processSlides.forEach((slide, i) => {
            if (i === index) {
                slide.classList.add('active');
            } else if (i < index) {
                slide.classList.add('prev');
            } else {
                slide.classList.add('next');
            }
        });
        
        // Update dots
        processDots.forEach(dot => {
            dot.classList.remove('active');
        });
        
        if (processDots[index]) {
            processDots[index].classList.add('active');
        }
        
        currentSlideIndex = index;
        
        // Reset transition flag after animation completes
        setTimeout(() => {
            isTransitioning = false;
        }, 500);
    }
    
    // Move slide function (for navigation buttons)
    window.moveSlide = function(direction) {
        const newIndex = currentSlideIndex + direction;
        
        if (newIndex >= 0 && newIndex < processSlides.length) {
            showSlide(newIndex);
        } else if (newIndex < 0) {
            showSlide(processSlides.length - 1); // Go to last slide
        } else {
            showSlide(0); // Go to first slide
        }
    };
    
    // Current slide function (for dots)
    window.currentSlide = function(index) {
        showSlide(index - 1); // Convert to 0-based index
    };
    
    // Auto-advance slider every 5 seconds
    function autoAdvanceSlider() {
        if (processSlides.length > 1) {
            setInterval(() => {
                moveSlide(1);
            }, 5000);
        }
    }
    
    // Initialize the slider
    initProcessSlider();
    
    // Start auto-advance after a delay
    setTimeout(autoAdvanceSlider, 3000);
    
    // Pause auto-advance on hover (optional enhancement)
    const sliderContainer = document.querySelector('.process-slider-container');
    if (sliderContainer) {
        sliderContainer.addEventListener('mouseenter', () => {
            // You can add pause functionality here if needed
        });
    }

});

// Preloader (optional)
window.addEventListener('load', function() {
    const preloader = document.querySelector('.preloader');
    if (preloader) {
        preloader.style.opacity = '0';
        setTimeout(() => {
            preloader.style.display = 'none';
        }, 300);
    }
});