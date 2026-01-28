/**
 * Environment Configuration Template
 * 
 * INSTRUCTIONS:
 * 1. Copy this file and rename it to 'config.js'
 * 2. Replace the placeholder values with your actual Supabase credentials
 * 3. Add config.js to your .gitignore to keep credentials secure
 * 
 * For detailed setup instructions, see SUPABASE_SETUP.md
 */

// Supabase Configuration
// Get these values from your Supabase project dashboard:
// Settings → API → Project URL and anon/public key

const SUPABASE_CONFIG = {
    url: 'YOUR_SUPABASE_URL',           // e.g., 'https://abcdefghijklmnop.supabase.co'
    anonKey: 'YOUR_SUPABASE_ANON_KEY'   // e.g., 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SUPABASE_CONFIG;
}

