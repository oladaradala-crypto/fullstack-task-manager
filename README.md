# TaskFlow — Full-Stack Task Manager

TaskFlow is a full-stack task management application I built to practise frontend development, backend development, database management, and user authentication.

## Features

- User registration and login
- Password hashing with bcryptjs
- JWT-based authentication
- Personal task dashboard
- Create, view, edit, and delete tasks
- Mark tasks as completed
- Task progress tracking
- PostgreSQL database integration
- Responsive design for desktop and mobile
- User-specific task management

## Technologies Used

**Frontend**
- HTML5
- CSS3
- JavaScript

**Backend**
- Node.js
- Express.js
- JWT
- bcryptjs

**Database**
- PostgreSQL

**Development Tools**
- Visual Studio Code
- Git
- GitHub
- GitHub Desktop
- pgAdmin 4

## Running the Project Locally

1. Clone this repository.
2. Install Node.js and PostgreSQL.
3. Open the project folder in your terminal.
4. Install dependencies:

   ```bash
   npm install
   ```

5. Create a PostgreSQL database named `taskflow_db`.
6. Copy `.env.example` to `.env` and configure your database credentials and a secure JWT secret.
7. Start the application:

   ```bash
   node server.js
   ```

8. Open `http://localhost:3000` in your browser.

The application initializes its required database tables when the server starts.

## Security

- Passwords are hashed before storage.
- Protected API endpoints require authentication.
- Users can only access their own tasks.
- Environment variables keep sensitive credentials out of the source code.

## About This Project

Building TaskFlow helped me gain practical experience connecting a frontend interface to a backend API and PostgreSQL database.

I also implemented user authentication, database operations, and responsive layouts.

This project is part of my full-stack development portfolio.

## Developer

**Jemilat Olatunji**

Full-Stack Web Development | Cybersecurity | UI/UX Design