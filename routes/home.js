// routes/home.js
const express = require('express');
const router  = express.Router();

// 1) Middleware to detect if logged in
function isLoggedIn(req, res, next) {
  if (req.session && req.session.username) {
    return next();
  }
  return res.redirect('/'); // or just let it fall through to render('home')
}

// 2) Public GET "/" (no session) → render generic home.ejs
router.get('/', (req, res) => {
  // If no user is in session, show the public landing page
  if (!req.session.username) {
    return res.render('home', { user: null });
  }

  // Otherwise, they *are* logged in—redirect based on role:
  if (req.session.role === 'student') {
    return res.redirect('/student');
  }
  if (req.session.role === 'teacher') {
    return res.redirect('/teacher');
  }
  if (req.session.role === 'admin') {
    return res.redirect('/admin');
  }
  // Fallback: if for some reason role is missing, just log them out
  return res.redirect('/logout');
});

module.exports = router;
