# Pristine Clean Services Website

## 🌟 Overview
A modern, responsive website for Pristine Clean Services featuring mobile-first design, comprehensive SEO optimization, smooth user experience, and integrated custom quote form with Supabase backend.

## 🚀 Features

### ✨ Design & User Experience
- **Mobile-First Responsive Design** - Optimized for all devices (320px - 1920px+)
- **Professional Blue & Black Color Scheme** - Consistent branding throughout
- **Smooth Animations** - Hardware-accelerated transitions and effects
- **Video Background Hero** - Dynamic background with custom multi-step form
- **Touch-Friendly Interface** - 44px+ touch targets for optimal mobile experience
- **Custom Multi-Step Form** - Beautiful inline quote form in hero section

### 🎯 Services Offered
- **Standard Cleaning** - Weekly, bi-weekly, monthly regular cleaning
- **Deep Cleaning** - Comprehensive intensive cleaning service
- **Move-In/Out Cleaning** - Specialized moving cleaning services
- **Vacation Rental Cleaning** - Short-term rental turnaround cleaning
- **Carpet Cleaning** - Professional carpet cleaning services
- **Office Cleaning** - Commercial cleaning solutions
- **Kitchen Cleaning** - Specialized kitchen deep cleaning
- **Post-Construction** - Post-renovation cleanup

### 📱 Technical Features
- **Progressive Web App (PWA)** - Service worker for offline functionality
- **SEO Optimized** - Complete meta tags, structured data, and sitemap
- **Accessibility First** - WCAG compliant with ARIA labels and keyboard navigation
- **Performance Optimized** - Lazy loading, preloading, and caching strategies
- **Cross-Browser Compatible** - Works on all modern browsers
- **Supabase Integration** - Real-time database for form submissions

### 🔧 Advanced Functionality
- **Interactive Navigation** - Dropdown menus with mobile hamburger menu
- **Custom Quote Form** - Multi-step form with validation and Supabase backend
- **Blog System** - SEO-optimized blog with search and filtering
- **Promotional Banner** - Convertible banner for special offers

## 📁 File Structure

```
pristineclean-master/
├── index.html                       # Homepage with custom form
├── assets/
│   ├── css/
│   │   └── style.css               # Main stylesheet with form styles
│   ├── js/
│   │   ├── script.js               # Main JavaScript
│   │   ├── hero-form.js            # Form logic and Supabase integration
│   │   └── config.template.js      # Configuration template
│   ├── images/                     # Image assets
│   └── videos/                     # Video backgrounds
├── pages/
│   ├── contact.html                # Contact page
│   ├── policy.html                 # Policies page
│   └── services/                   # Service pages
├── blogs/                          # Blog articles
├── SUPABASE_SETUP.md              # Detailed Supabase setup guide
├── server.js                       # Node.js development server
├── sw.js                          # Service worker for PWA
├── sitemap.xml                    # SEO sitemap
├── robots.txt                     # Search engine crawler instructions
├── package.json                   # Node.js dependencies
└── README.md                      # This file
```

## 🛠️ Technologies Used

- **HTML5** - Semantic markup with accessibility features
- **CSS3** - Advanced features including Grid, Flexbox, Custom Properties
- **Vanilla JavaScript** - Modern ES6+ with async/await
- **Supabase** - PostgreSQL database for form submissions
- **Node.js** - Development server
- **Service Workers** - Progressive Web App functionality
- **JSON-LD** - Structured data for SEO

## 🚀 Getting Started

### Prerequisites
- Node.js installed on your system
- A free Supabase account (see Setup Guide below)

### Installation & Running
1. Clone or download the project files
2. Navigate to the project directory
3. Install dependencies (if any):
   ```bash
   npm install
   ```
4. Run the development server:
   ```bash
   node server.js
   ```
5. Open your browser to `http://localhost:8000`

### Supabase Setup (Required for Form to Work)

**Important:** The quote form requires Supabase configuration to store submissions.

1. Read the detailed setup guide: `SUPABASE_SETUP.md`
2. Create a free Supabase account at [https://supabase.com](https://supabase.com)
3. Create a new project
4. Run the SQL schema provided in `SUPABASE_SETUP.md`
5. Get your API credentials from Supabase dashboard
6. Update `assets/js/hero-form.js` with your credentials:
   ```javascript
   const SUPABASE_URL = 'your-project-url';
   const SUPABASE_ANON_KEY = 'your-anon-key';
   ```

**Quick Setup (5 minutes):**
- Follow the step-by-step guide in `SUPABASE_SETUP.md`
- The free plan is sufficient for most use cases
- No credit card required for the free tier

## 📊 SEO Features

### Meta Tags & Social Media
- Complete meta descriptions and keywords
- Open Graph tags for Facebook/LinkedIn sharing
- Twitter Card tags for Twitter sharing
- Canonical URLs to prevent duplicate content

### Structured Data (JSON-LD)
- LocalBusiness schema for main business information
- Service schema for individual cleaning services
- ContactPage schema for contact information
- Blog/Article schema for blog posts

### Technical SEO
- XML sitemap with all pages
- Robots.txt for search engine guidance
- Proper heading hierarchy (H1-H6)
- Alt text for all images
- Internal linking structure

## 🎨 Design System

### Colors
- Primary: `#3E38FF` (Brand Blue)
- Secondary: `#000000` (Black)
- Text: `#333333` (Dark Grey)
- Background: `#ffffff` (White)
- Hover: `#1e40af` (Darker Blue)

### Typography
- Font Family: Inter (Google Fonts)
- Headings: Poppins (Google Fonts)
- Font Weights: 400, 500, 600, 700
- Responsive font scaling across all devices

### Components
- Multi-step form with progress indicator
- Buttons with hover effects and loading states
- Cards with shadows and rounded corners
- Forms with validation and mobile optimization
- Navigation with dropdown menus

## 📱 Mobile Optimization

### Breakpoints
- **Ultra Small**: ≤ 360px (Older devices)
- **Small Mobile**: 361px - 480px (Standard smartphones)
- **Large Mobile**: 481px - 768px (Large phones, small tablets)
- **Tablet**: 769px - 1024px (iPad, large tablets)
- **Desktop**: 1025px+ (Desktop and larger)

### Touch Optimization
- Minimum 44px touch targets
- Touch feedback animations
- Swipe gestures support
- iOS Safari optimizations
- Viewport height adjustments

## 🔧 Performance Features

### Loading Optimization
- Critical resource preloading
- Font preloading and optimization
- Image lazy loading
- Service worker caching
- Async script loading

### Animation Performance
- Hardware acceleration (GPU)
- Reduced motion support
- Optimized transitions
- Smooth scrolling
- RequestAnimationFrame for animations

## ♿ Accessibility

### WCAG Compliance
- Proper ARIA labels and roles
- Keyboard navigation support
- Screen reader compatibility
- High contrast mode support
- Focus management
- Form validation with error messages

### User Preferences
- Reduced motion support
- High contrast support
- Font size scaling
- Color blindness considerations

## 🔍 Browser Support

- **Chrome/Edge**: Full support (latest 2 versions)
- **Firefox**: Full support (latest 2 versions)
- **Safari**: Full support (latest 2 versions)
- **Mobile Browsers**: Optimized for iOS Safari and Chrome Mobile

## 📈 Performance Metrics

### Core Web Vitals Optimized
- **LCP (Largest Contentful Paint)**: < 2.5s
- **FID (First Input Delay)**: < 100ms
- **CLS (Cumulative Layout Shift)**: < 0.1

### Features for Speed
- Minified and optimized CSS/JS
- Compressed images
- Efficient caching strategies
- Reduced HTTP requests
- Optimized database queries

## 🗃️ Database Schema

The Supabase database includes the following table:

### `quote_requests`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key (auto-generated) |
| first_name | TEXT | Customer's first name |
| last_name | TEXT | Customer's last name |
| phone | TEXT | Phone number |
| email | TEXT | Email address |
| timeline | TEXT | Service timeline (asap/30days/30plus) |
| service_type | TEXT | Service type (recurring/onetime) |
| submitted_at | TIMESTAMP | Submission date/time |
| status | TEXT | Request status (new/contacted/quoted/booked) |
| created_at | TIMESTAMP | Record creation timestamp |
| updated_at | TIMESTAMP | Record update timestamp |

## 🔐 Security

- Row Level Security (RLS) enabled on Supabase
- Public API key safe for frontend use
- No sensitive data exposed in client code
- HTTPS enforced for all connections
- Input validation and sanitization

## 🤝 Contributing

This is a production website for Pristine Clean Services. For updates or modifications, please contact the development team.

## 📞 Support

For website-related issues or updates:
- Email: contact@pristineandclean.ca
- Phone: (437) 545-8704

## 📄 License

© 2025 Pristine Clean Services. All rights reserved.

---

**Built with ❤️ for Pristine Clean Services**

*Last Updated: December 20, 2025*
