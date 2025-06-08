// routes/role.js
const express = require('express');
const router  = express.Router();
const User    = require('../models/User');
const Course = require('../models/Course');
const Registration = require('../models/Registration');
const mongoose = require('mongoose');
const Message      = require('../models/Message'); // ← new



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

// -----------------------------------------
// TEACHER DASHBOARD: GET /teacher
// -----------------------------------------
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

// -----------------------------------------
// AVAILABLE / ASSIGNED CLASSES: GET /teacher/classes
// -----------------------------------------
router.get(
  '/teacher/classes',
  isLoggedIn,
  requireRole('teacher'),
  async (req, res) => {
    try {
      // 1) Fetch all courses that have no teacher assigned
      const availableCourses = await Course.find({ teacher: null }).lean();

      // 2) Fetch courses where teacher === this teacher
      const assignedCourses = await Course.find({ teacher: req.session.userId }).lean();

      return res.render('available_classes_teacher', {
        user: {
          username: req.session.username,
          name: req.session.name,
          role: req.session.role
        },
        availableCourses,
        assignedCourses,
        errorMsg: undefined
      });
    } catch (err) {
      console.error('❌ Error loading teacher classes:', err);
      return res.render('available_classes_teacher', {
        user: {
          username: req.session.username,
          name: req.session.name,
          role: req.session.role
        },
        availableCourses: [],
        assignedCourses: [],
        errorMsg: 'Unable to load classes. Please try again.'
      });
    }
  }
);

// -----------------------------------------
// REGISTER (ASSIGN) A CLASS: POST /teacher/classes/:courseId/register
// -----------------------------------------
router.post(
  '/teacher/classes/:courseId/register',
  isLoggedIn,
  requireRole('teacher'),
  async (req, res) => {
    const { courseId } = req.params;
    try {
      // 1) Find the course by its _id
      const course = await Course.findById(courseId);
      if (!course) {
        return res.status(404).send('Course not found');
      }

      // 2) Ensure it has no teacher already
      if (course.teacher) {
        return res.status(400).send('Course already has a teacher');
      }

      // 3) Assign this teacher
      course.teacher = req.session.userId;
      await course.save();

      // 4) Redirect back to /teacher/classes
      return res.redirect('/teacher/classes');
    } catch (err) {
      console.error('❌ Error assigning class to teacher:', err);
      // Re‐render with errorMsg
      try {
        const availableCourses = await Course.find({ teacher: null }).lean();
        const assignedCourses = await Course.find({ teacher: req.session.userId }).lean();
        return res.render('available_classes_teacher', {
          user: {
            username: req.session.username,
            name: req.session.name,
            role: req.session.role
          },
          availableCourses,
          assignedCourses,
          errorMsg: 'Unable to assign class. Please try again.'
        });
      } catch (innerErr) {
        console.error('❌ Error reloading classes after assign failure:', innerErr);
        return res.status(500).send('Server error');
      }
    }
  }
);

// -----------------------------------------
// REMOVE (UNASSIGN) A CLASS: POST /teacher/classes/:courseId/remove
// -----------------------------------------
router.post(
  '/teacher/classes/:courseId/remove',
  isLoggedIn,
  requireRole('teacher'),
  async (req, res) => {
    const { courseId } = req.params;
    try {
      // Find the course where teacher matches this teacher
      const course = await Course.findOne({
        _id: courseId,
        teacher: req.session.userId
      });
      if (!course) {
        return res.status(404).send('You are not assigned to this course');
      }

      // Unassign the teacher
      course.teacher = null;
      await course.save();

      return res.redirect('/teacher/classes');
    } catch (err) {
      console.error('❌ Error unassigning class from teacher:', err);
      // Re‐render with errorMsg
      try {
        const availableCourses = await Course.find({ teacher: null }).lean();
        const assignedCourses = await Course.find({ teacher: req.session.userId }).lean();
        return res.render('available-classes', {
          user: {
            username: req.session.username,
            name: req.session.name,
            role: req.session.role
          },
          availableCourses,
          assignedCourses,
          errorMsg: 'Unable to remove class. Please try again.'
        });
      } catch (innerErr) {
        console.error('❌ Error reloading classes after remove failure:', innerErr);
        return res.status(500).send('Server error');
      }
    }
  }
);

// -----------------------------------------
// TEACHER: CLASS INFO MENU → GET /teacher/info
// -----------------------------------------
router.get(
  '/teacher/info',
  isLoggedIn,
  requireRole('teacher'),
  async (req, res) => {
    try {
      // Fetch all courses assigned to this teacher
      const assignedCourses = await Course.find({ teacher: req.session.userId }).lean();

      return res.render('teacher-info', {
        user: {
          username: req.session.username,
          name: req.session.name,
          role: req.session.role
        },
        assignedCourses,
        errorMsg: undefined
      });
    } catch (err) {
      console.error('❌ Error loading teacher class info:', err);
      return res.render('teacher-info', {
        user: {
          username: req.session.username,
          name: req.session.name,
          role: req.session.role
        },
        assignedCourses: [],
        errorMsg: 'Unable to load your classes. Please try again.'
      });
    }
  }
);

// -----------------------------------------
// TEACHER: SEE STUDENTS IN A COURSE → GET /teacher/info/:courseId/students
// -----------------------------------------
router.get(
  '/teacher/info/:courseId/students',
  isLoggedIn,
  requireRole('teacher'),
  async (req, res) => {
    const { courseId } = req.params;
    try {
      // 1) Verify this teacher is assigned to that course
      const course = await Course.findOne({
        _id: courseId,
        teacher: req.session.userId
      }).lean();

      if (!course) {
        return res.status(404).send('Course not found or not assigned to you');
      }

      // 2) Find all registrations for that course and populate student fields
      const regs = await Registration
        .find({ course: courseId })  // <— let Mongoose cast the string
        .populate('student')
        .lean();

      // 3) Extract only the student objects (filter out null just in case)
      const students = regs
        .map(r => r.student)
        .filter(s => s);

      return res.render('teacher-course-students', {
        user: {
          username: req.session.username,
          name: req.session.name,
          role: req.session.role
        },
        course,
        students,
        errorMsg: undefined
      });
    } catch (err) {
      console.error('❌ Error loading students for course:', err);
      return res.render('teacher-course-students', {
        user: {
          username: req.session.username,
          name: req.session.name,
          role: req.session.role
        },
        course: null,
        students: [],
        errorMsg: 'Unable to load students for this class.'
      });
    }
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

router.get(
  '/messages',
  isLoggedIn,
  async (req, res) => {
    try {
      // 1. Fetch all messages where receiver = current user
      const msgs = await Message
        .find({ receiver: req.session.userId })
        .populate('sender', 'name username role') // only need name/username/role
        .sort({ sentAt: -1 })
        .lean();

      return res.render('messages', {
        user: {
          username: req.session.username,
          name: req.session.name,
          role: req.session.role
        },
        messages: msgs,
        errorMsg: undefined
      });
    } catch (err) {
      console.error('❌ Error loading inbox:', err);
      return res.render('messages', {
        user: {
          username: req.session.username,
          name: req.session.name,
          role: req.session.role
        },
        messages: [],
        errorMsg: 'Unable to load your messages. Please try again.'
      });
    }
  }
);


// ==================================
// SHOW SEND MESSAGE FORM: GET /messages/send
// ==================================
router.get(
  '/messages/send',
  isLoggedIn,
  async (req, res) => {
    res.render('send-message', {
      user: {
        username: req.session.username,
        name: req.session.name,
        role: req.session.role
      },
      errorMsg: undefined,
      successMsg: undefined
    });
  }
);


// ==================================
// HANDLE SEND MESSAGE: POST /messages/send
// ==================================
router.post(
  '/messages/send',
  isLoggedIn,
  async (req, res) => {
    const { recipientUsername, content } = req.body;

    // Validate presence
    if (!recipientUsername || !recipientUsername.trim()) {
      return res.render('send-message', {
        user: { username: req.session.username, name: req.session.name, role: req.session.role },
        errorMsg: 'Please enter a recipient username.',
        successMsg: undefined
      });
    }
    if (!content || !content.trim()) {
      return res.render('send-message', {
        user: { username: req.session.username, name: req.session.name, role: req.session.role },
        errorMsg: 'Message content cannot be empty.',
        successMsg: undefined
      });
    }

    try {
      // Lookup by username instead of idNumber
      const recipient = await User.findOne({ username: recipientUsername.trim() });
      if (!recipient) {
        return res.render('send-message', {
          user: { username: req.session.username, name: req.session.name, role: req.session.role },
          errorMsg: 'Recipient username not found.',
          successMsg: undefined
        });
      }

      // Save the message
      await Message.create({
        sender:   req.session.userId,
        receiver: recipient._id,
        content:  content.trim()
      });

      return res.render('send-message', {
        user:       { username: req.session.username, name: req.session.name, role: req.session.role },
        errorMsg:   undefined,
        successMsg: 'Message sent successfully!'
      });
    } catch (err) {
      console.error('❌ Error sending message:', err);
      return res.render('send-message', {
        user:       { username: req.session.username, name: req.session.name, role: req.session.role },
        errorMsg:   'Server error. Please try again later.',
        successMsg: undefined
      });
    }
  }
);


// =======================================
// 2) VIEW SINGLE MESSAGE: GET /messages/:messageId
// =======================================
router.get(
  '/messages/:messageId',
  isLoggedIn,
  async (req, res) => {
    const { messageId } = req.params;
    try {
      // 1. Fetch the message by ID and populate sender and receiver
      const msg = await Message
        .findById(messageId)
        .populate('sender', 'name username role')
        .populate('receiver', 'name username role')
        .lean();

      // 2. If not found or current user is not the receiver, 404
      if (!msg || msg.receiver._id.toString() !== req.session.userId) {
        return res.status(404).send('Message not found');
      }

      return res.render('message-detail', {
        user: {
          username: req.session.username,
          name: req.session.name,
          role: req.session.role
        },
        message: msg
      });
    } catch (err) {
      console.error('❌ Error loading message detail:', err);
      return res.status(500).send('Server error');
    }
  }
);


module.exports = router;
