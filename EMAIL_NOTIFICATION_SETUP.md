# Email Notification Setup for Form Submissions

## 📧 Get Notified When Someone Submits the Quote Form

Every time someone fills out your quote form, you'll receive an email at **contact@pristineandclean.ca**

---

## ✅ OPTION 1: Using Make.com (Easiest - Recommended)

### Step 1: Create Make.com Account (FREE)

1. Go to **https://www.make.com/en/register**
2. Sign up for a **FREE account** (1000 operations/month - more than enough!)
3. Verify your email

### Step 2: Create Supabase Webhook

1. Go to your **Supabase Dashboard**: https://supabase.com/dashboard/project/beqjprowrjkuvtdrjize
2. Click **"Database"** → **"Webhooks"** (left sidebar)
3. Click **"Create a new hook"**
4. Fill in:
   - **Name**: `notify_new_quote`
   - **Table**: `quote_requests`
   - **Events**: Check **"Insert"** only
   - **Type**: HTTP Request
   - **URL**: (We'll get this from Make.com in Step 3)
5. **Don't save yet - wait for Step 3!**

### Step 3: Create Make.com Scenario

1. In Make.com, click **"Create a new scenario"**
2. Click the **"+"** button
3. Search for **"Webhooks"**
4. Select **"Custom webhook"**
5. Click **"Add"** → **"Create a webhook"**
6. Name it: `Quote Form Submission`
7. **Copy the webhook URL** (looks like: https://hook.us1.make.com/...)
8. Go back to Supabase and **paste this URL** in the webhook URL field
9. Click **"Create hook"** in Supabase

### Step 4: Add Email Module in Make.com

1. In Make.com, click the **"+"** button after the webhook
2. Search for **"Email"**
3. Select **"Send an Email"**
4. Fill in:
   - **To**: `contact@pristineandclean.ca`
   - **Subject**: Click in the field and add:
     ```
     New Quote Request from [first_name] [last_name]
     ```
   - **Content (HTML)**:
     ```html
     <h2>New Quote Request Received!</h2>
     
     <p><strong>Customer Details:</strong></p>
     <ul>
       <li><strong>Name:</strong> [first_name] [last_name]</li>
       <li><strong>Email:</strong> [email]</li>
       <li><strong>Phone:</strong> [phone]</li>
       <li><strong>Timeline:</strong> [timeline]</li>
       <li><strong>Submitted:</strong> [submitted_at]</li>
     </ul>
     
     <p>Please follow up with this customer as soon as possible!</p>
     
     <hr>
     <p><small>Submitted from pristinecleanservices.ca</small></p>
     ```

5. **Important**: When typing the fields like `[first_name]`, click the field and select from the webhook data that appears!

### Step 5: Test It!

1. In Make.com, click **"Run once"** (bottom left)
2. Go to your website: https://pristinecleanservices.ca
3. Fill out and submit the form
4. Check Make.com - it should show the data received!
5. Check your email at **contact@pristineandclean.ca** - you should have received the notification!

### Step 6: Activate

1. In Make.com, toggle the switch at the bottom to **"ON"**
2. Click **"Save"**

**Done! You'll now get an email every time someone submits the form!**

---

## ✅ OPTION 2: Using Zapier (Alternative)

Zapier is similar to Make.com but has a smaller free tier (100 tasks/month):

1. Go to **https://zapier.com/sign-up**
2. Create a **Zap**
3. **Trigger**: Webhooks by Zapier → Catch Hook
4. Copy the webhook URL
5. Add it to Supabase Database Webhooks (same as Step 2 above)
6. **Action**: Gmail or Email by Zapier → Send Email
7. Configure the email template (same as Step 4 above)
8. Test and turn on!

---

## ✅ OPTION 3: Supabase Edge Function (Advanced)

If you want more control and no third-party services:

### Prerequisites:
- Supabase CLI installed
- Resend account (free tier: 100 emails/day)

### Step 1: Create Resend Account

1. Go to **https://resend.com/signup**
2. Verify your email
3. Go to **API Keys** → **Create API Key**
4. Copy the API key

### Step 2: Create Edge Function

1. Install Supabase CLI:
   ```powershell
   npm install -g supabase
   ```

2. Login to Supabase:
   ```powershell
   supabase login
   ```

3. Initialize:
   ```powershell
   supabase init
   ```

4. Create function:
   ```powershell
   supabase functions new send-quote-email
   ```

5. Edit `supabase/functions/send-quote-email/index.ts`:
   ```typescript
   import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

   const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

   serve(async (req) => {
     try {
       const { record } = await req.json()

       const res = await fetch('https://api.resend.com/emails', {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json',
           'Authorization': `Bearer ${RESEND_API_KEY}`
         },
         body: JSON.stringify({
           from: 'notifications@pristinecleanservices.ca',
           to: 'contact@pristineandclean.ca',
           subject: `New Quote Request from ${record.first_name} ${record.last_name}`,
           html: `
             <h2>New Quote Request Received!</h2>
             <p><strong>Customer Details:</strong></p>
             <ul>
               <li><strong>Name:</strong> ${record.first_name} ${record.last_name}</li>
               <li><strong>Email:</strong> ${record.email}</li>
               <li><strong>Phone:</strong> ${record.phone}</li>
               <li><strong>Timeline:</strong> ${record.timeline}</li>
               <li><strong>Submitted:</strong> ${record.submitted_at}</li>
             </ul>
             <p>Please follow up with this customer as soon as possible!</p>
           `
         })
       })

       const data = await res.json()
       return new Response(JSON.stringify(data), {
         headers: { 'Content-Type': 'application/json' },
         status: 200
       })
     } catch (error) {
       return new Response(JSON.stringify({ error: error.message }), {
         headers: { 'Content-Type': 'application/json' },
         status: 400
       })
     }
   })
   ```

6. Deploy:
   ```powershell
   supabase functions deploy send-quote-email --project-ref beqjprowrjkuvtdrjize
   ```

7. Set secret:
   ```powershell
   supabase secrets set RESEND_API_KEY=your_resend_api_key_here --project-ref beqjprowrjkuvtdrjize
   ```

8. Create Database Webhook in Supabase:
   - URL: `https://beqjprowrjkuvtdrjize.supabase.co/functions/v1/send-quote-email`
   - Add Authorization header: `Bearer YOUR_SUPABASE_ANON_KEY`

---

## 🎯 Recommendation

**Use OPTION 1 (Make.com)** - It's:
- ✅ FREE (1000 operations/month)
- ✅ No coding required
- ✅ Easy to set up (5 minutes)
- ✅ Easy to modify email template
- ✅ Visual interface
- ✅ Reliable

---

## 📋 What You'll Receive in Each Email

```
Subject: New Quote Request from [Customer Name]

New Quote Request Received!

Customer Details:
• Name: John Doe
• Email: john@example.com
• Phone: (123) 456-7890
• Timeline: ASAP (Within 7 Days)
• Submitted: 2025-12-20 10:30:45

Please follow up with this customer as soon as possible!

---
Submitted from pristinecleanservices.ca
```

---

## 🔧 Troubleshooting

**Not receiving emails?**
1. Check Make.com execution history
2. Verify webhook URL in Supabase is correct
3. Check spam/junk folder
4. Test the webhook manually in Supabase
5. Make sure Make.com scenario is "ON"

**Need help?**
- Make.com has great support and documentation
- Supabase webhook docs: https://supabase.com/docs/guides/database/webhooks

---

## 💡 Tips

- You can add more email recipients in Make.com
- You can customize the email template anytime
- You can add SMS notifications through Twilio module
- You can send data to Google Sheets for tracking
- The free tier is more than enough for your needs!

