// routes/role.js
const express = require('express');
const router  = express.Router();
const User    = require('../models/User');
const Course = require('../models/Course');
const Registration = require('../models/Registration');
const mongoose = require('mongoose');


// 1. Middleware: Ensure the user is logged in
function isLoggedIn(req, res, next) {
  if (!req.session || !req.session.username) {
    return res.redirect('/login');
  }
  next();
}

// 2. Middleware factory: Ensure the user has a specific role
function requireRole(role) {
  return function (req, res, next) {
    if (req.session.role !== role) {
      // You can redirect elsewhere or send a 403
      return res.status(403).send('403: Access denied');
    }
    next();
  };
}

// -----------------------------------------
// 1) STUDENT DASHBOARD: GET /student
// -----------------------------------------
router.get(
  '/student',
  isLoggedIn,
  requireRole('student'),
  (req, res) => {
    // Render a simple student menu with two options
    return res.render('student', {
      user: {
        username: req.session.username,
        name: req.session.name,
        role: req.session.role
      }
    });
  }
);

// -----------------------------------------
// 2) AVAILABLE COURSES: GET /student/courses
// -----------------------------------------
router.get(
  '/student/courses',
  isLoggedIn,
  requireRole('student'),
  async (req, res) => {
    try {
      // Fetch future courses
      const now = new Date();
      const futureCourses = await Course.find({ startDate: { $gt: now } }).lean();

      // Fetch existing registrations for this student
      const registrations = await Registration.find({ student: req.session.userId }).lean();
      const registeredIds = new Set(registrations.map(r => r.course.toString()));

      // Filter out courses already registered
      const availableCourses = futureCourses.filter(c => !registeredIds.has(c._id.toString()));

      return res.render('available-courses', {
        user: {
          username: req.session.username,
          name: req.session.name,
          role: req.session.role
        },
        availableCourses,
        errorMsg: undefined
      });
    } catch (err) {
      console.error('❌ Error loading available courses:', err);
      return res.render('available-courses', {
        user: {
          username: req.session.username,
          name: req.session.name,
          role: req.session.role
        },
        availableCourses: [],
        errorMsg: 'Unable to load courses. Please try again.'
      });
    }
  }
);

// ----------------------------------------------
// 4) VIEW REGISTERED COURSES: GET /student/registrations
// ----------------------------------------------
router.get(
  '/student/registrations',
  isLoggedIn,
  requireRole('student'),
  async (req, res) => {
    try {
      // 1. Load all registrations for this student, populating the course field
      const regs = await Registration
        .find({ student: req.session.userId })
        .populate('course')
        .lean();

      // 2. Separate valid registrations (course still exists) from orphans
      const validRegs  = regs.filter(r => r.course);
      const orphanRegs = regs.filter(r => !r.course).map(r => r._id);

      // 3. Clean up orphaned registrations
      if (orphanRegs.length > 0) {
        await Registration.deleteMany({ _id: { $in: orphanRegs } });
      }

      // 4. Extract the remaining course objects
      const registeredCourses = validRegs.map(r => r.course);

      return res.render('registered-courses', {
        user: {
          username: req.session.username,
          name: req.session.name,
          role: req.session.role
        },
        registeredCourses,
        errorMsg: undefined
      });
    } catch (err) {
      console.error('❌ Error loading registered courses:', err);
      return res.render('registered-courses', {
        user: {
          username: req.session.username,
          name: req.session.name,
          role: req.session.role
        },
        registeredCourses: [],
        errorMsg: 'Unable to load your registered courses.'
      });
    }
  }
);


// -----------------------------------------
// 3) REGISTER FOR A COURSE: POST /student/courses/:courseId/register
// -----------------------------------------
router.post(
  '/student/courses/:courseId/register',
  isLoggedIn,
  requireRole('student'),
  async (req, res) => {
    const { courseId } = req.params;
    try {
      // Find course by _id
      const course = await Course.findById(courseId);
      if (!course) {
        return res.status(404).send('Course not found');
      }

      // Ensure course hasn't started
      if (course.startDate <= new Date()) {
        return res.status(400).send('Cannot register: course has already started');
      }

      // Create registration
      await Registration.create({
        student: req.session.userId,
        course: course._id
      });

      return res.redirect('/student/courses');
    } catch (err) {
      console.error('❌ Error registering for course:', err);
      let msg = 'Unable to register. Please try again.';
      if (err.code === 11000) {
        msg = 'You are already registered for this course.';
      }
      // Re‐render available courses with error
      try {
        const now = new Date();
        const futureCourses = await Course.find({ startDate: { $gt: now } }).lean();
        const registrations = await Registration.find({ student: req.session.userId }).lean();
        const registeredIds = new Set(registrations.map(r => r.course.toString()));
        const availableCourses = futureCourses.filter(c => !registeredIds.has(c._id.toString()));
        return res.render('available-courses', {
          user: {
            username: req.session.username,
            name: req.session.name,
            role: req.session.role
          },
          availableCourses,
          errorMsg: msg
        });
      } catch (innerErr) {
        console.error('❌ Error reloading available courses after failure:', innerErr);
        return res.status(500).send('Server error');
      }
    }
  }
);

// ----------------------------------------------
// UNREGISTER FROM COURSE: POST /student/registrations/:courseId/remove
// ----------------------------------------------
router.post(
  '/student/registrations/:courseId/remove',
  isLoggedIn,
  requireRole('student'),
  async (req, res) => {
    const { courseId } = req.params;
    try {
      // Delete the registration matching this student and course.
      // Mongoose will cast `courseId` string to ObjectId automatically.
      await Registration.findOneAndDelete({
        student: req.session.userId,
        course: courseId
      });

      // Redirect back to the “registered courses” page
      return res.redirect('/student/registrations');
    } catch (err) {
      console.error('❌ Error unregistering from course:', err);
      // On error, re‐render the registered‐courses page with an error.
      try {
        // Re‐fetch valid registrations (same as GET /student/registrations)
        const regs = await Registration
          .find({ student: req.session.userId })
          .populate('course')
          .lean();
        const validRegs = regs.filter(r => r.course);
        const orphanRegs = regs.filter(r => !r.course).map(r => r._id);
        if (orphanRegs.length > 0) {
          await Registration.deleteMany({ _id: { $in: orphanRegs } });
        }
        const registeredCourses = validRegs.map(r => r.course);

        return res.render('registered-courses', {
          user: {
            username: req.session.username,
            name: req.session.name,
            role: req.session.role
          },
          registeredCourses,
          errorMsg: 'Unable to remove course. Please try again.'
        });
      } catch (innerErr) {
        console.error('❌ Error reloading after unregister failure:', innerErr);
        return res.status(500).send('Server error');
      }
    }
  }
);

// 4. Teacher-only page (GET /teacher)
router.get(
  '/teacher',
  isLoggedIn,
  requireRole('teacher'),
  (req, res) => {
    return res.render('teacher', {
      user: {
        username: req.session.username,
        name: req.session.name,
        role: req.session.role
      }
    });
  }
);

router.get(
  '/admin',
  isLoggedIn,
  requireRole('admin'),
  (req, res) => {
    // Render admin.ejs, passing only the session user (to show name/username/role)
    return res.render('admin', { user: { 
      username: req.session.username, 
      name: req.session.name, 
      role: req.session.role 
    }});
  }
);


// -------------------------------------
// List All Courses: GET /admin/courses
// -------------------------------------
// -------------------------------------
// LIST COURSES AS CARDS: GET /admin/courses
// -------------------------------------
router.get(
  '/admin/courses',
  isLoggedIn,
  requireRole('admin'),
  async (req, res) => {
    try {
      // Fetch all courses, sorted by courseId
      const courses = await Course.find().sort({ courseId: 1 }).lean();
      return res.render('courses', {
        user: { 
          username: req.session.username, 
          name: req.session.name, 
          role: req.session.role 
        },
        courses,
        errorMsg: undefined
      });
    } catch (err) {
      console.error('❌ Error fetching courses:', err);
      return res.render('courses', {
        user: { 
          username: req.session.username, 
          name: req.session.name, 
          role: req.session.role 
        },
        courses: [],
        errorMsg: 'Unable to load courses.'
      });
    }
  }
);

// -------------------------------------
// Show “Add Course” Form: GET /admin/courses/new
// -------------------------------------
router.get(
  '/admin/courses/new',
  isLoggedIn,
  requireRole('admin'),
  (req, res) => {
    return res.render('new-course', {
      user: { 
        username: req.session.username, 
        name: req.session.name, 
        role: req.session.role 
      },
      errorMsg: undefined
    });
  }
);

// -------------------------------------
// Handle “Add Course” Form Submission: POST /admin/courses
// -------------------------------------
router.post(
  '/admin/courses',
  isLoggedIn,
  requireRole('admin'),
  async (req, res) => {
    const { courseId, name, section, startDate, endDate, description } = req.body;

    // Basic validation: all fields are required
    if (!courseId || !name || !section || !startDate || !endDate || !description) {
      return res.render('new-course', {
        user: { 
          username: req.session.username, 
          name: req.session.name, 
          role: req.session.role 
        },
        errorMsg: 'All fields are required.'
      });
    }

    try {
      // Create and save new course
      const newCourse = new Course({
        courseId,
        name,
        section,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        description
      });
      await newCourse.save();
      // Redirect back to list of courses
      return res.redirect('/admin/courses');
    } catch (err) {
      console.error('❌ Error creating course:', err);
      // If duplicate courseId (err.code === 11000), show specific message
      let msg = 'Server error. Please try again.';
      if (err.code === 11000) {
        msg = 'Course ID already exists. Choose a unique ID.';
      }
      return res.render('new-course', {
        user: { 
          username: req.session.username, 
          name: req.session.name, 
          role: req.session.role 
        },
        errorMsg: msg
      });
    }
  }
);

// -------------------------------------
// COURSE DETAIL PAGE: GET /admin/courses/:courseId
// -------------------------------------
router.get(
  '/admin/courses/:courseId',
  isLoggedIn,
  requireRole('admin'),
  async (req, res) => {
    const { courseId } = req.params;
    try {
      const course = await Course.findOne({ courseId }).lean();
      if (!course) {
        return res.status(404).send('Course not found');
      }
      return res.render('course-detail', {
        user: {
          username: req.session.username,
          name: req.session.name,
          role: req.session.role
        },
        course,
        errorMsg: undefined
      });
    } catch (err) {
      console.error('❌ Error fetching course detail:', err);
      return res.status(500).send('Server error');
    }
  }
);

// -------------------------------------
// UPDATE COURSE (POST): /admin/courses/:courseId/edit
// Processes the edit form
// -------------------------------------
router.post(
  '/admin/courses/:courseId/edit',
  isLoggedIn,
  requireRole('admin'),
  async (req, res) => {
    const { courseId } = req.params;
    const { name, section, startDate, endDate, description } = req.body;

    // Basic validation
    if (!name || !section || !startDate || !endDate || !description) {
      // Re-fetch course for re-render
      try {
        const course = await Course.findOne({ courseId }).lean();
        return res.render('course-detail', {
          user: {
            username: req.session.username,
            name: req.session.name,
            role: req.session.role
          },
          course,
          errorMsg: 'All fields are required.'
        });
      } catch (innerErr) {
        console.error('❌ Error refetching course after validation error:', innerErr);
        return res.status(500).send('Server error');
      }
    }

    try {
      // Find and update the course
      const course = await Course.findOne({ courseId });
      if (!course) {
        return res.status(404).send('Course not found');
      }
      course.name        = name;
      course.section     = section;
      course.startDate   = new Date(startDate);
      course.endDate     = new Date(endDate);
      course.description = description;

      await course.save();

      // Redirect back to the detail page
      return res.redirect(`/admin/courses/${courseId}`);
    } catch (err) {
      console.error('❌ Error updating course:', err);
      // On error, re-fetch and show message
      try {
        const course = await Course.findOne({ courseId }).lean();
        return res.render('course-detail', {
          user: {
            username: req.session.username,
            name: req.session.name,
            role: req.session.role
          },
          course,
          errorMsg: 'Unable to save changes. Please try again.'
        });
      } catch (innerErr) {
        console.error('❌ Error refetching course after update failure:', innerErr);
        return res.status(500).send('Server error');
      }
    }
  }
);

// -------------------------------------
// DELETE COURSE (POST): /admin/courses/:courseId/delete
// Removes the course and redirects to list
// -------------------------------------
router.post(
  '/admin/courses/:courseId/delete',
  isLoggedIn,
  requireRole('admin'),
  async (req, res) => {
    const { courseId } = req.params;
    try {
      await Course.deleteOne({ courseId });
      return res.redirect('/admin/courses');
    } catch (err) {
      console.error('❌ Error deleting course:', err);
      // On delete failure, re-fetch course and show error on detail page
      try {
        const course = await Course.findOne({ courseId }).lean();
        return res.render('course-detail', {
          user: {
            username: req.session.username,
            name: req.session.name,
            role: req.session.role
          },
          course,
          errorMsg: 'Unable to delete course. Please try again.'
        });
      } catch (innerErr) {
        console.error('❌ Error refetching course after delete failure:', innerErr);
        return res.status(500).send('Server error');
      }
    }
  }
);

router.get(
  '/profile',
  isLoggedIn,
  async (req, res) => {
    try {
      // 1. Fetch the user by username from session
      const user = await User.findOne({ username: req.session.username }).lean();
      if (!user) {
        // Somehow the user isn’t in DB; log out
        return res.redirect('/logout');
      }
      // 2. Render profile.ejs, passing user data (and no errorMsg by default)
      return res.render('profile', { user, errorMsg: undefined });
    } catch (err) {
      console.error('❌ Error fetching user for profile:', err);
      // If DB error, redirect to home or show generic message
      return res.status(500).send('Server error');
    }
  }
);

router.post(
  '/profile',
  isLoggedIn,
  async (req, res) => {
    const { name, password, address, phone } = req.body;
    const username = req.session.username; // cannot be changed
    try {
      // 1. Find the user document by username
      const user = await User.findOne({ username });
      if (!user) {
        return res.redirect('/logout');
      }

      // 2. Update allowed fields
      user.name    = name;
      user.password = password;  // stored as plain text per your current setup
      user.address = address;
      user.phone   = phone;

      // Role and username remain unchanged

      await user.save();

      // 3. Update session.name so header greeting stays correct
      req.session.name = name;

      // 4. After saving, re-fetch updated user and re-render
      const updated = await User.findOne({ username }).lean();
      return res.render('profile', { user: updated, errorMsg: undefined });
    } catch (err) {
      console.error('❌ Error updating profile:', err);
      // If some DB error occurred, re-render with an errorMsg
      try {
        const user = await User.findOne({ username }).lean();
        return res.render('profile', {
          user,
          errorMsg: 'Unable to save changes. Please try again.'
        });
      } catch (innerErr) {
        console.error('❌ Error refetching user after failed update:', innerErr);
        return res.status(500).send('Server error');
      }
    }
  }
);

// -------------------------
// LIST/SEARCH STUDENTS: GET /admin/students
// -------------------------
router.get(
  '/admin/students',
  isLoggedIn,
  requireRole('admin'),
  async (req, res) => {
    const searchId = req.query.searchId;
    try {
      let students;
      if (searchId) {
        // Exact match on idNumber
        const student = await User.findOne({ idNumber: searchId, role: 'student' }).lean();
        students = student ? [student] : [];
      } else {
        // All students
        students = await User.find({ role: 'student' }).sort({ idNumber: 1 }).lean();
      }
      return res.render('students_admin', {
        user: {
          username: req.session.username,
          name: req.session.name,
          role: req.session.role
        },
        students,
        searchId: searchId || '',
        errorMsg: undefined
      });
    } catch (err) {
      console.error('❌ Error fetching students:', err);
      return res.render('students_admin', {
        user: {
          username: req.session.username,
          name: req.session.name,
          role: req.session.role
        },
        students: [],
        searchId: searchId || '',
        errorMsg: 'Unable to load students.'
      });
    }
  }
);

// -------------------------
// LIST/SEARCH TEACHERS: GET /admin/teachers
// -------------------------
router.get(
  '/admin/teachers',
  isLoggedIn,
  requireRole('admin'),
  async (req, res) => {
    const searchId = req.query.searchId;
    try {
      let teachers;
      if (searchId) {
        const teacher = await User.findOne({ idNumber: searchId, role: 'teacher' }).lean();
        teachers = teacher ? [teacher] : [];
      } else {
        teachers = await User.find({ role: 'teacher' }).sort({ idNumber: 1 }).lean();
      }
      return res.render('teachers_admin', {
        user: {
          username: req.session.username,
          name: req.session.name,
          role: req.session.role
        },
        teachers,
        searchId: searchId || '',
        errorMsg: undefined
      });
    } catch (err) {
      console.error('❌ Error fetching teachers:', err);
      return res.render('teachers_admin', {
        user: {
          username: req.session.username,
          name: req.session.name,
          role: req.session.role
        },
        teachers: [],
        searchId: searchId || '',
        errorMsg: 'Unable to load teachers.'
      });
    }
  }
);


module.exports = router;
