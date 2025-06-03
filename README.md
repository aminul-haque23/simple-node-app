# Website hosted at: 
https://simple-node-app-pmcg.onrender.com/


# School Management System

A full‐stack Node.js application for managing a school’s users (students, teachers, admins) and courses. Built with Express, EJS, and MongoDB (Mongoose), it implements role‐based authentication, profile management, and CRUD operations. Admins can manage courses and view student/teacher lists; users can sign up with a unique numeric ID, log in, and view/edit their own profiles.

## Features

1. **User Authentication & Roles**  
   - **Sign Up** with a **unique numeric ID**, name, username, password, address, phone, and role (student/teacher/admin).  
   - **Log In** and **Log Out** via Express sessions.  
   - Role‐based redirects:  
     - Students → `/student`  
     - Teachers → `/teacher`  
     - Admins → `/admin`

2. **Profile Management**  
   - Each logged‐in user has a `/profile` page showing their details:  
     - ID Number (digits only)  
     - Name  
     - Username  
     - Password  
     - Address  
     - Phone  
     - Role  
   - Users can **edit** their `name`, `password`, `address`, and `phone`, but cannot change `username`, `role`, or `idNumber`.

3. **Admin Dashboard**  
   - Accessible only to users with `role: "admin"`.  
   - Dashboard displays admin info (name, username, role).  
   - Three management sections (buttons):  
     - **Manage Courses** → `/admin/courses`  
     - **Manage Students** → `/admin/students`  
     - **Manage Teachers** → `/admin/teachers`

4. **Course Management**  
   - **Course Model**:  
     - `courseId` (unique string),  
     - `name`,  
     - `section`,  
     - `startDate`,  
     - `endDate`,  
     - `description`.  
   - **List All Courses** (`/admin/courses`):  
     - Displayed as cards showing only `courseId`, `name`, and `section`.  
     - Each card links to a detail page.  
   - **Add Course** (`/admin/courses/new`):  
     - Form collects all fields; `courseId` must be unique.  
   - **Course Detail** (`/admin/courses/:courseId`):  
     - Prefilled form for editing `name`, `section`, `startDate`, `endDate`, and `description`.  
     - `courseId` is read‐only.  
     - Red “Delete Course” button removes the course and redirects to `/admin/courses`.

5. **Student & Teacher Management**  
   - **List All Students** (`/admin/students`) and **List All Teachers** (`/admin/teachers`) as small cards:  
     - Each card shows `name`, `idNumber`, and `username`.  
   - **Search by ID Number**:  
     - A search bar at the top filters the list to a single user if a matching `idNumber` is provided.

---

## Technologies Used

- **Node.js** (v14+)  
- **Express** (v4)  
- **EJS** as templating engine  
- **MongoDB** Atlas (via Mongoose)  
- **Express-Session** for session management  
- **CSS** (custom, responsive styling)  

---


