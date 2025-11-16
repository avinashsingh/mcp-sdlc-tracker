# SQLite MCP Tracker Server

A Model Context Protocol (MCP) server that provides SQLite-based task and project tracking capabilities through standardized tools and resources.

## Features

- **SDLC Entity Management**: Complete Software Development Lifecycle tracking
- **Epics, User Stories, Tasks, Bugs, Test Cases**: Full SDLC workflow support
- **Comments System**: Stakeholder feedback and collaboration on all entities
- **Workflow Enforcement**: Proper stakeholder ownership and status transitions
- **Audit Trail**: Ownership and status transition tracking
- **SQLite Backend**: Uses SQLite with better-sqlite3 for efficient operations

## Tools Available

### Database Management
- `initialize`: Initialize the SDLC tracker database in the specified project directory. You must provide your current working directory path (e.g., "/Users/username/project").

### Epic Management
- `create_epics`: Create multiple epics with title, description, and productmanager assignment
- `list_epics`: List epics with optional status filtering

### User Story Management
- `create_user_stories`: Create multiple user stories with epic association, acceptance criteria, and story points
- `list_user_stories`: List user stories with filtering by epic, status, or assignee

### Task Management
- `create_tasks`: Create multiple tasks with user story association, time estimates, and architect/developer assignment
- `list_tasks`: List tasks with optional filtering
- `update_task_status`: Update task status

### Bug Tracking
- `create_bugs`: Create multiple bug reports with severity levels, reporter, and assignee information
- `list_bugs`: List bugs with optional filtering by status, severity, reporter, assignee

### Test Case Management
- `create_test_cases`: Create multiple test cases with preconditions, steps, expected results, and tester/productmanager assignment
- `list_test_cases`: List test cases with optional filtering by status, assignee

### Workflow Management
- `update_entity_status`: Update status of any SDLC entity with audit trail recording
- `update_task_status`: Update task status

### Comments Support
- `create_comments`: Create comments on any SDLC entity for stakeholder feedback

## Resources Available

- `database_schema`: Provides information about the database schema and table structures

## Installation

```bash
npm install
```

## Usage

### Running the Server

```bash
npm start
```

Or for development with auto-restart:

```bash
npm run dev
```

### Initializing the Database

Before using any other tools, you must initialize the database:

1. Call the `initialize` tool and provide your current working directory path (e.g., "/Users/username/project")
2. The tool will create `.project_tracker.db` in that directory and set up all necessary tables

### Connecting to MCP Clients

This server uses stdio transport, so it can be connected to any MCP-compatible client such as:

- **Claude Code**: `claude mcp add --transport stdio my-tracker "npm start"`
- **Cursor**: Configure in MCP settings with stdio transport
- **VS Code**: Configure in MCP settings with stdio transport

## Database Schema

The `initialize` tool creates a SQLite database file `.project_tracker.db` in the specified directory with a complete SDLC schema:

### Core SDLC Entities

#### Epics Table
- `id`: Primary key (auto-increment)
- `title`: Epic title (required)
- `description`: Epic description (optional)
- `status`: Epic status ('New', 'Open', 'Closed')
- `created_by`: Creator stakeholder (enum)
- `owner`: Current owner ('product')
- `assigned_to`: Assigned to ('product' only)
- `created_at/updated_at`: Timestamps
- `closed_at`: Closure timestamp

#### User Stories Table
- `id`: Primary key (auto-increment)
- `epic_id`: Foreign key to epics (optional)
- `title`: User story title (required)
- `description`: User story description (optional)
- `acceptance_criteria`: Acceptance criteria (optional)
- `status`: Status ('New', 'In Progress', 'QA', 'Closed')
- `created_by/current_owner/assigned_to`: Stakeholder assignments (enum)
- `story_points`: Story point estimate (optional)
- `created_at/updated_at/qa_at/closed_at`: Timestamps

#### Tasks Table
- `id`: Primary key (auto-increment)
- `user_story_id`: Foreign key to user_stories (optional)
- `title`: Task title (required)
- `description`: Task description (optional)
- `status`: Status ('New', 'In Progress', 'Closed')
- `created_by/current_owner/assigned_to`: Stakeholder assignments ('architect', 'developer')
- `estimated_hours/actual_hours`: Time tracking (optional)
- `created_at/updated_at/closed_at`: Timestamps

#### Bugs Table
- `id`: Primary key (auto-increment)
- `user_story_id/task_id`: Foreign keys (optional)
- `title`: Bug title (required)
- `description`: Bug description (optional)
- `severity`: Severity level ('Critical', 'High', 'Medium', 'Low')
- `status`: Status ('Open', 'In Progress', 'Fixed', 'Closed')
- `reported_by/assigned_to/created_by/current_owner`: Stakeholder assignments (enum)
- `created_at/updated_at/fixed_at/closed_at`: Timestamps

#### Test Cases Table
- `id`: Primary key (auto-increment)
- `user_story_id`: Foreign key to user_stories (optional)
- `title`: Test case title (required)
- `description/preconditions/steps/expected_result`: Test details
- `status`: Status ('New', 'Passed', 'Failed')
- `created_by/current_owner/assigned_to`: Stakeholder assignments ('tester', 'productmanager')
- `created_at/updated_at/last_run_at/last_run_by`: Timestamps

#### Comments Table
- `id`: Primary key (auto-increment)
- `entity_type`: Type of entity ('epic', 'user_story', 'task', 'bug', 'test_case')
- `entity_id`: Foreign key to the entity
- `comment_text`: Comment content (required)
- `author`: Comment author stakeholder (enum)
- `created_at/updated_at`: Timestamps

### Audit Trail Tables

#### Ownership Transitions
- Tracks all ownership changes between stakeholders

#### Status Transitions
- Tracks all status changes with timestamps and actors

### Indexes
- Performance indexes on all foreign keys and commonly filtered columns
- Composite indexes for efficient entity-type queries
- Comments entity index for fast entity-based filtering

## SDLC Workflow

The server implements a complete Software Development Lifecycle with proper stakeholder ownership:

### Entity States & Transitions
- **Epics**: New → Open → Closed (owned by productmanager)
- **User Stories**: New → In Progress → QA → UAT → Closed (productmanager → architect → developer → tester → productmanager)
- **Tasks**: New → In Progress → Closed (architect → developer → architect)
- **Bugs**: Open → In Progress → Fixed → Closed (any stakeholder can be involved)
- **Test Cases**: New, Passed, Failed (tester → productmanager → tester)

### Stakeholders
- **productmanager**: Product management
- **programmanager**: Program management
- **architect**: Solution architecture
- **developer**: Development team
- **tester**: Quality assurance

### Comments System
- Comments can be added to any SDLC entity by any stakeholder
- Supports threaded discussions and feedback on requirements, implementations, and issues
- Maintains full audit trail with author and timestamps

### Audit Trail
All ownership and status transitions are recorded in audit tables for complete traceability.

## Project Folder Access

The MCP server requires explicit initialization with the project directory path for security reasons. The `initialize` tool must be called first with your current working directory path before any other tools can be used.

## Example Usage

Once connected to an MCP client, you can:

### Database Initialization
1. "Initialize the database with path '/Users/username/my-project'"

### Epic Management
1. "Create epics: 'User Authentication System' and 'Payment Processing'"
2. "List all open epics"

### User Story Creation
3. "Create user stories: 'As a user, I want to login with email/password' (5 points) and 'As a user, I want to reset my password' (3 points) for epic 1"
4. "List user stories in progress assigned to developer"

### Task Breakdown
5. "Create tasks: 'Implement password hashing' (4 hours) and 'Create login UI' (6 hours) for user story 1 assigned to developer"
6. "List tasks that are in progress"
7. "Update task 1 status to 'Closed'"

### Bug Tracking
7. "Create bugs: 'Login fails on mobile devices' (Critical, reported by tester) and 'Password reset email not sent' (High, reported by productmanager)"
8. "List all open bugs with high severity"

### Test Case Creation
9. "Create test cases: 'Verify user can login successfully' and 'Verify password reset works' for user story 1"
10. "List test cases that have failed"

### Comments and Collaboration
11. "Add comment on user story 1: 'Need to ensure security best practices' by architect"
12. "Add comment on bug 1: 'Validation should check email format' by developer"

### Workflow Management
13. "Update user story 1 status to 'In Progress' transitioned by architect"
14. "Update task 1 status to 'Closed' transitioned by developer"

## Testing

The project includes comprehensive test suites:

### Unit Tests
```bash
npm test
```
Runs unit tests that directly test database operations and business logic.

### Integration Tests
```bash
npm run test:integration
```
Runs integration tests that start the MCP server, initialize the database, and verify end-to-end functionality including:
- Server startup and connectivity
- Database initialization via MCP
- Database operations (create, read, update)
- Server stability
- Proper cleanup

## Development

The server is written in TypeScript and uses:
- `@modelcontextprotocol/sdk`: Official MCP TypeScript SDK
- `better-sqlite3`: High-performance SQLite library
- `zod`: Schema validation for tool inputs/outputs

## License

ISC