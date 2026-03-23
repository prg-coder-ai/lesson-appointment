# Lesson Appointment API - Spring Boot

A RESTful API server for managing lesson appointments, built with Spring Boot 3 + JPA + MySQL.

## Tech Stack

- **Java 17**
- **Spring Boot 3.2.5**
- **Spring Data JPA** (Hibernate)
- **MySQL 8.0**
- **Lombok**
- **Maven**

## Database

Database name: `lesson_appointment`  
Default connection: `localhost:3306`  
Username: `root`  Password: `123456`

Configure in `src/main/resources/application.yml`.

## Entities & API Endpoints

| Entity | Table | Base URL |
|---|---|---|
| User | `user` | `/api/users` |
| CourseTemplate | `course_template` | `/api/course-templates` |
| Course | `course` | `/api/courses` |
| Schedule | `schedule` | `/api/schedules` |
| Booking | `booking` | `/api/bookings` |
| CourseEvaluation | `course_evaluation` | `/api/course-evaluations` |
| CourseFeedback | `course_feedback` | `/api/course-feedbacks` |
| CourseCheckIn | `course_check_in` | `/api/course-check-ins` |

Each endpoint supports full CRUD:

| Method | Path | Description |
|---|---|---|
| GET | `/api/{resource}` | List all (supports query params) |
| GET | `/api/{resource}/{id}` | Get by ID |
| POST | `/api/{resource}` | Create |
| PUT | `/api/{resource}/{id}` | Update |
| DELETE | `/api/{resource}/{id}` | Delete |

## Query Parameters

### Users
- `GET /api/users?role=teacher` — filter by role (student/teacher/admin)
- `GET /api/users?status=active` — filter by status

### CourseTemplates
- `GET /api/course-templates?languageType=英语`
- `GET /api/course-templates?difficultyLevel=进阶`

### Courses
- `GET /api/courses?teacherId={id}`
- `GET /api/courses?templateId={id}`

### Schedules
- `GET /api/schedules?courseId={id}`
- `GET /api/schedules?status=available`
- `GET /api/schedules?courseId={id}&status=available`

### Bookings
- `GET /api/bookings?studentId={id}`
- `GET /api/bookings?scheduleId={id}`
- `GET /api/bookings?status=booked`

### CourseEvaluations
- `GET /api/course-evaluations?studentId={id}`
- `GET /api/course-evaluations?teacherId={id}`
- `GET /api/course-evaluations?courseId={id}`
- `GET /api/course-evaluations/booking/{bookingId}`

### CourseFeedbacks
- `GET /api/course-feedbacks?courseId={id}`
- `GET /api/course-feedbacks?userId={id}`
- `GET /api/course-feedbacks?handleStatus=0`

### CourseCheckIns
- `GET /api/course-check-ins?bookingId={id}`

## Response Format

All responses use a unified format:

```json
{
  "code": 200,
  "message": "success",
  "data": { ... }
}
```

Error example:
```json
{
  "code": 404,
  "message": "User not found: xxx",
  "data": null
}
```

## How to Run

### Prerequisites

1. Java 17+
2. Maven 3.6+
3. MySQL 8.0 running with the `lesson_appointment` database created (run the provided SQL script first)

### Steps

```bash
# 1. Import the database schema
mysql -u root -p < database.sql

# 2. Build the project
mvn clean package -DskipTests

# 3. Run
java -jar target/lesson-appointment-api-1.0.0.jar
```

Or with Maven directly:

```bash
mvn spring-boot:run
```

Server starts on **http://localhost:8080**

## Example Requests

```bash
# List all teachers
curl http://localhost:8080/api/users?role=teacher

# Create a student
curl -X POST http://localhost:8080/api/users \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138001","email":"student@example.com","password":"pass1234","role":"student","learnGoal":"Improve English speaking","languageLevel":"中级","status":"active"}'

# Create a course template
curl -X POST http://localhost:8080/api/course-templates \
  -H "Content-Type: application/json" \
  -d '{"languageType":"英语","difficultyLevel":"中级","classFee":150.00,"classDuration":60,"classForm":"一对一","description":"Standard English conversation course for intermediate learners"}'

# List available schedules for a course
curl "http://localhost:8080/api/schedules?courseId=xxx&status=available"

# Create a booking
curl -X POST http://localhost:8080/api/bookings \
  -H "Content-Type: application/json" \
  -d '{"scheduleId":"xxx","studentId":"yyy","status":"booked"}'
```

## Project Structure

```
src/main/java/com/lessonappointment/
├── LessonAppointmentApplication.java   # Main entry point
├── common/
│   ├── Result.java                     # Unified response wrapper
│   └── GlobalExceptionHandler.java    # Global error handler
├── entity/                             # JPA entities (8 tables)
├── repository/                         # Spring Data JPA repositories
├── service/                            # Business logic layer
└── controller/                         # REST API controllers
```
