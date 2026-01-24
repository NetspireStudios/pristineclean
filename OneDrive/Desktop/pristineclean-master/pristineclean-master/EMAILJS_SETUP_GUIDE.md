# EmailJS Setup Guide - Get Email Notifications

## 📧 Receive emails at contact@pristineandclean.ca when forms are submitted

**Time to complete: 5 minutes**  
**Cost: FREE (200 emails/month)**

---

## Step 1: Create EmailJS Account

1. Go to **https://www.emailjs.com/**
2. Click **"Sign Up Free"**
3. Enter your email and create a password
4. Verify your email address

---

## Step 2: Add Email Service

1. After logging in, go to **"Email Services"** (left sidebar)
2. Click **"Add New Service"**
3. Choose **"Gmail"** (recommended) or any other email service
4. Click **"Connect Account"**
5. **Sign in with your Google account** (the one that has contact@pristineandclean.ca)
6. Allow EmailJS to send emails on your behalf
7. **Copy the Service ID** (looks like `service_abc123`) - save this!
8. Click **"Create Service"**

---

## Step 3: Create Email Template

1. Go to **"Email Templates"** (left sidebar)
2. Click **"Create New Template"**
3. Delete the default content and paste this:

### Template Settings:
- **Template Name**: `Quote Request Notification`

### Email Content:

**Subject Line:**
```
New Quote Request from {{customer_name}}
```

**Content (HTML):**
```html
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #4F46E5; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
        .detail-row { margin: 10px 0; padding: 10px; background: white; border-radius: 4px; }
        .label { font-weight: bold; color: #4F46E5; }
        .cta { background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 20px; }
        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 New Quote Request!</h1>
        </div>
        <div class="content">
            <p>You've received a new quote request from your website.</p>
            
            <div class="detail-row">
                <span class="label">👤 Customer Name:</span><br>
                {{customer_name}}
            </div>
            
            <div class="detail-row">
                <span class="label">📧 Email:</span><br>
                <a href="mailto:{{customer_email}}">{{customer_email}}</a>
            </div>
            
            <div class="detail-row">
                <span class="label">📱 Phone:</span><br>
                <a href="tel:{{customer_phone}}">{{customer_phone}}</a>
            </div>
            
            <div class="detail-row">
                <span class="label">⏰ Timeline:</span><br>
                {{timeline}}
            </div>
            
            <div class="detail-row">
                <span class="label">🕐 Submitted:</span><br>
                {{submitted_at}}
            </div>
            
            <p><strong>⚡ Action Required:</strong> Please follow up with this customer as soon as possible!</p>
            
            <a href="mailto:{{customer_email}}" class="cta">Reply to Customer</a>
        </div>
        <div class="footer">
            <p>This email was sent automatically from pristinecleanservices.ca</p>
        </div>
    </div>
</body>
</html>
```

4. **Copy the Template ID** (looks like `template_xyz789`) - save this!
5. Click **"Save"**

---

## Step 4: Get Your Public Key

1. Go to **"Account"** (left sidebar)
2. Find **"API Keys"** section
3. **Copy your Public Key** (looks like `abc123xyz789`) - save this!

---

## Step 5: Update Your Code

Now update the `assets/js/hero-form.js` file with your keys:

1. Open `assets/js/hero-form.js`
2. Find these lines near the top (around line 8-10):

```javascript
const EMAILJS_PUBLIC_KEY = 'YOUR_EMAILJS_PUBLIC_KEY'; // Get from emailjs.com
const EMAILJS_SERVICE_ID = 'YOUR_SERVICE_ID'; // Get from emailjs.com
const EMAILJS_TEMPLATE_ID = 'YOUR_TEMPLATE_ID'; // Get from emailjs.com
```

3. Replace with YOUR actual keys:

```javascript
const EMAILJS_PUBLIC_KEY = 'abc123xyz789'; // Your Public Key from Step 4
const EMAILJS_SERVICE_ID = 'service_abc123'; // Your Service ID from Step 2
const EMAILJS_TEMPLATE_ID = 'template_xyz789'; // Your Template ID from Step 3
```

4. Save the file

---

## Step 6: Push to GitHub

```powershell
git add assets/js/hero-form.js
git commit -m "Configure EmailJS for email notifications"
git push origin master
```

---

## Step 7: Test It!

1. Wait 2-3 minutes for Vercel to deploy
2. Go to your website: https://pristinecleanservices.ca
3. Fill out and submit the quote form
4. Check your email at **contact@pristineandclean.ca**
5. You should receive a beautifully formatted email! 🎉

---

## 📊 What You'll Receive

Every time someone submits the form, you'll get an email like this:

```
Subject: New Quote Request from John Doe

🎉 New Quote Request!

You've received a new quote request from your website.

👤 Customer Name: John Doe
📧 Email: john@example.com
📱 Phone: (123) 456-7890
⏰ Timeline: ASAP (Within 7 Days)
🕐 Submitted: December 20, 2024, 10:30 AM

⚡ Action Required: Please follow up with this customer ASAP!

[Reply to Customer Button]
```

---

## 🔧 Troubleshooting

### Not receiving emails?

1. **Check spam/junk folder** - EmailJS emails sometimes go to spam initially
2. **Check EmailJS Dashboard** - Go to "History" to see if emails were sent
3. **Verify keys** - Make sure you copied the right keys from EmailJS
4. **Check console** - Open browser console (F12) and look for email-related errors
5. **Test from EmailJS** - Use their "Test" feature in the template editor

### Email goes to spam?

1. In EmailJS, go to your email template
2. Click "Test"
3. Mark the test email as "Not Spam" in your inbox
4. Future emails should go to inbox

### Hit the free limit (200/month)?

- Upgrade to EmailJS paid plan ($15/month for 2000 emails)
- Or use Make.com as backup (see `EMAIL_NOTIFICATION_SETUP.md`)

---

## 💡 Tips

- ✅ EmailJS is perfect for static websites
- ✅ Works directly from browser JavaScript
- ✅ No backend or server needed
- ✅ 200 free emails per month is usually enough
- ✅ Professional looking email templates
- ✅ Can add attachments, CC, BCC if needed

---

## 🎯 Next Steps

Once working, you can:
- Add more recipients (CC/BCC)
- Customize the email template design
- Set up auto-reply to customers
- Create different templates for different forms
- Monitor usage in EmailJS dashboard

---

## 📞 Need Help?

- EmailJS Docs: https://www.emailjs.com/docs/
- EmailJS Support: support@emailjs.com
- They have great customer support!

---

**That's it! You'll now get notified every time someone requests a quote!** 🚀

