# SQLite MCP Tracker Server

A Model Context Protocol (MCP) server that provides SQLite-based task and project tracking capabilities through standardized tools and resources.

## Features

- **SDLC Entity Management**: Complete Software Development Lifecycle tracking
- **Epics, User Stories, Tasks, Bugs, Test Cases**: Full SDLC workflow support
- **Comments System**: Stakeholder feedback and collaboration on all entities
- **Workflow Enforcement**: Proper stakeholder ownership and status transitions
- **Audit Trail**: Ownership and status transition tracking
- **Data Validation**: Comprehensive input validation and foreign key constraint checking
- **Error Handling**: Clear error messages for invalid operations and constraint violations
- **SQLite Backend**: Uses SQLite with better-sqlite3 for efficient operations

## Tools Available

### Database Management
- `initialize`: Initialize the SDLC tracker database in the specified project directory. You must provide your current working directory path (e.g., "/Users/username/project").

### Epic Management
- `create_epics`: Create multiple epics with title, description, and productmanager assignment
- `list_epics`: List epics with optional status filtering (excludes archived by default)
- `update_epic`: Update epic title, description, status, assignment, and phases
- `archive_epic`: Archive epics (product managers only)

### User Story Management
- `create_user_stories`: Create multiple user stories with epic association, acceptance criteria, and story points
- `list_user_stories`: List user stories with filtering by epic, status, or assignee (excludes archived by default)
- `update_user_story_content`: Update user story title, description, and story points (all stakeholders)
- `update_user_story_acceptance_criteria`: Update user story acceptance criteria (product managers only)
- `archive_user_story`: Archive user stories (product managers only)

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
- `update_entity_status`: Update status and/or assignment of any SDLC entity with audit trail recording
- `update_task_status`: Update task status
- `manage_story_dependencies`: Add or remove dependencies for multiple user stories in bulk

### Comments Support
- `create_comments`: Create comments on any SDLC entity for stakeholder feedback

## Error Handling & Validation

The server includes comprehensive error handling and data validation:

### Input Validation
- **Required Fields**: All required fields are validated using Zod schemas
- **Data Types**: Proper type checking for all inputs
- **Enum Values**: Stakeholder roles and status values are strictly validated

### Foreign Key Validation
- **Reference Checking**: All foreign key references (epic_id, user_story_id, task_id) are validated before database operations
- **Clear Error Messages**: Invalid references return specific error messages (e.g., "Invalid epic IDs: 999")
- **Constraint Enforcement**: Database constraints are checked and violations are handled gracefully

### Error Response Format
- **Consistent Structure**: All tools return structured error responses with clear messages
- **Partial Success**: Creation tools can return both successful and failed operations in a single response
- **Validation Errors**: Input validation failures include detailed field-level error information

### Example Error Responses
```javascript
// Foreign key validation error
"Invalid epic IDs: 999"

// Input validation error
{
  "code": "too_small",
  "minimum": 1,
  "message": "Title is required"
}

// Constraint violation
"FOREIGN KEY constraint failed"
```

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

This server uses stdio transport, so it can be connected to any MCP-compatible client. Below are setup instructions for popular AI coding agents:

#### Claude Code
```bash
claude mcp add --transport stdio my-tracker "npm start"
```

#### OpenCode
Add to your OpenCode MCP configuration:
```json
{
  "mcpServers": {
    "sdlc-tracker": {
      "command": "npm",
      "args": ["start"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

#### OpenAI Codex
Add to `~/.codex/config.toml`:
```toml
[[mcp]]
name = "sdlc-tracker"
command = "npm"
args = ["start"]
cwd = "/path/to/your/project"
```

#### Windsurf
Configure in Windsurf's MCP settings with stdio transport and command `npm start`.

#### Cursor
1. Open Cursor settings
2. Navigate to MCP section
3. Add new server with:
   - Transport: stdio
   - Command: `npm start`
   - Working directory: `/path/to/your/project`

#### VS Code
1. Install an MCP extension (like "MCP" or "Claude Code")
2. Configure with stdio transport
3. Set command to `npm start`

#### Other MCP-Compatible Clients
- **Cline**: Configure in settings with stdio transport
- **Roo Code**: Add server configuration with `npm start` command
- **Continue**: Add to config.json with stdio transport
- **Zed**: Configure in MCP settings panel

For all clients, ensure you're running the command from your project directory where the SDLC tracker database should be initialized.

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
- `status`: Status ('New', 'In Progress', 'QA', 'UAT', 'Closed')
- `created_by/current_owner/assigned_to`: Stakeholder assignments (enum)
- `story_points`: Story point estimate (optional)
- `phase`: Phase name (optional, nullable)
- `phase_status`: Phase completion status (optional, defaults to 'New')
- `created_at/updated_at/qa_at/closed_at`: Timestamps

#### Tasks Table
- `id`: Primary key (auto-increment)
- `user_story_id`: Foreign key to user_stories (optional)
- `title`: Task title (required)
- `description`: Task description (optional)
- `status`: Status ('New', 'In Progress', 'Review', 'Closed')
- `created_by/current_owner/assigned_to`: Stakeholder assignments ('architect', 'developer')
- `estimated_hours/actual_hours`: Time tracking (optional)
- `phase`: Phase name (optional, nullable)
- `phase_status`: Phase completion status (optional, defaults to 'New')
- `created_at/updated_at/closed_at`: Timestamps

#### Bugs Table
- `id`: Primary key (auto-increment)
- `user_story_id/task_id`: Foreign keys (optional)
- `title`: Bug title (required)
- `description`: Bug description (optional)
- `severity`: Severity level ('Critical', 'High', 'Medium', 'Low')
- `status`: Status ('Open', 'In Progress', 'Fixed', 'Closed')
- `reported_by/assigned_to/created_by/current_owner`: Stakeholder assignments (enum)
- `phase`: Phase name (optional, nullable)
- `phase_status`: Phase completion status (optional, defaults to 'Open')
- `created_at/updated_at/fixed_at/closed_at`: Timestamps

#### Test Cases Table
- `id`: Primary key (auto-increment)
- `user_story_id`: Foreign key to user_stories (optional)
- `title`: Test case title (required)
- `description/preconditions/steps/expected_result`: Test details
- `status`: Status ('New', 'Passed', 'Failed')
- `created_by/current_owner/assigned_to`: Stakeholder assignments ('tester', 'productmanager')
- `phase`: Phase name (optional, nullable)
- `phase_status`: Phase completion status (optional, defaults to 'New')
- `created_at/updated_at/last_run_at/last_run_by`: Timestamps

#### Story Dependencies Table
- `id`: Primary key (auto-increment)
- `dependent_story_id`: Foreign key to user_stories (story that depends on another)
- `dependency_story_id`: Foreign key to user_stories (story being depended upon)
- `created_at`: Timestamp when dependency was created
- `created_by`: Stakeholder who created the dependency
- **Constraints**: No self-dependencies, no duplicate dependencies, cascade delete

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
- **Tasks**: New → In Progress → Review → Closed (architect → developer → architect)
- **Bugs**: Open → In Progress → Fixed → Closed (any stakeholder can be involved)
- **Test Cases**: New, Passed, Failed (tester → productmanager → tester)

### Stakeholders
- **productmanager**: Product management
- **programmanager**: Program management
- **architect**: Solution architecture
- **developer**: Development team
- **tester**: Quality assurance

### Story Dependencies
Stories can have dependencies on other stories to model complex project relationships:
- **Many-to-Many Relationships**: One story can depend on multiple stories, and multiple stories can depend on one story
- **Dependency Validation**: Prevents circular dependencies and self-dependencies
- **Smart Ordering**: `list_user_stories` returns stories with least/fewest dependencies first
- **Bulk Management**: Add/remove dependencies for multiple stories in single operations
- **Visual Indicators**: Dependency counts shown in UI with clickable links

### Phase Management
Entities can be assigned to custom phases for project organization:
- **Phase**: Custom phase name (e.g., "Planning", "Development", "Testing", "Deployment")
- **Phase Status**: Current status within the phase (e.g., "Not Started", "In Progress", "Completed", "Blocked")
- **Optional**: Phases are completely optional and don't affect core workflow transitions
- **Flexible**: Phase names are free-form text, allowing custom project-specific phases
- **Filtering**: All list operations support filtering by `phase` and `phase_status` parameters
- **Setting**: Phases can be set during entity creation or updated via `update_entity_status`

### User Story Permissions & Archiving
User stories have restricted update permissions and archiving capabilities:
- **Content Updates**: All stakeholders can update title, description, and story points
- **Acceptance Criteria**: Only Product Managers can update acceptance criteria
- **Archiving**: Only Product Managers can archive user stories with reason tracking
- **Archived Stories**: Hidden from default views, accessible with `include_archived: true`
- **Audit Trail**: All content and acceptance criteria changes are fully audited

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
3. "Create user stories: 'As a user, I want to login with email/password' (5 points) and 'As a user, I want to reset my password' (3 points) for epic 1" (Note: Epic ID is validated - invalid references return clear error messages)
4. "Create user story with phase: 'Implement user dashboard' (8 points) for epic 1 with phase 'Development' and phase_status 'Planning'"
5. "List user stories in progress assigned to developer"
6. "List user stories in 'Development' phase"

### Task Breakdown
5. "Create tasks: 'Implement password hashing' (4 hours) and 'Create login UI' (6 hours) for user story 1 assigned to developer" (Note: User story references are validated)
6. "Create task with phase: 'Write unit tests' (3 hours) for user story 1 with phase 'Testing' and phase_status 'Not Started'"
7. "List tasks that are in progress"
8. "List tasks in 'Testing' phase with 'Not Started' status"
9. "Update task 1 status to 'Closed'"
10. "Update task 2 phase to 'Testing' and phase_status 'In Progress'"

### Story Dependencies
11. "Add dependencies: Story 2 depends on Story 1, Story 3 depends on Story 2"
12. "Remove dependency: Story 3 no longer depends on Story 2"
13. "List user stories ordered by dependencies (least dependent first)"

### Bug Tracking
7. "Create bugs: 'Login fails on mobile devices' (Critical, reported by tester) and 'Password reset email not sent' (High, reported by productmanager)" (Note: User story and task references are validated if provided)
8. "List all open bugs with high severity"

### Test Case Creation
9. "Create test cases: 'Verify user can login successfully' and 'Verify password reset works' for user story 1" (Note: User story references are validated if provided)
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
- Error handling and validation
- Foreign key constraint checking
- Server stability
- Proper cleanup

## Development

The server is written in TypeScript and uses:

- `@modelcontextprotocol/sdk`: Official MCP TypeScript SDK
- `better-sqlite3`: High-performance SQLite library
- `zod`: Schema validation for tool inputs/outputs

### Recent Improvements

- **Enhanced Error Handling**: Comprehensive validation with clear error messages
- **Foreign Key Validation**: All entity references are validated before database operations
- **Consistent API Responses**: All list tools now use standardized response format
- **Improved Data Integrity**: Better constraint checking and error reporting

## License

ISC