# SQLite MCP Tracker Server

A Model Context Protocol (MCP) server that provides SQLite-based task and project tracking capabilities through standardized tools and resources.

## Features

- **SDLC Entity Management**: Complete Software Development Lifecycle tracking
- **Epics, User Stories, Tasks, Bugs, Test Cases**: Full SDLC workflow support
- **Wiki System**: Integrated wiki for project documentation with entity linking
- **Comments System**: Stakeholder feedback and collaboration on all entities with comment counts
- **Epic Dependencies**: Epics can depend on other epics (similar to user story dependencies)
- **Workflow Enforcement**: Proper stakeholder ownership and status transitions
- **Audit Trail**: Ownership and status transition tracking
- **Data Validation**: Comprehensive input validation and foreign key constraint checking
- **Boolean Field Handling**: Proper boolean conversion for archived fields (true/false instead of 0/1)
- **HTTP API**: REST endpoints for database initialization, SDLC entities, and wiki pages
- **Web UI**: Tabbed dashboard interface with SDLC tracker and wiki sections
- **Error Handling**: Clear error messages for invalid operations and constraint violations
- **SQLite Backend**: Uses SQLite with better-sqlite3 for efficient operations

## Tools Available

### Database Management
- `initialize`: Initialize the SDLC tracker database in the specified project directory. You must provide your current working directory path (e.g., "/Users/username/project").

### Epic Management
- `create_epics`: Create multiple epics with title, description, and productmanager assignment
- `list_epics`: List epics with optional status filtering (excludes archived by default)
  - `dependencies_resolved`: Filter epics by dependency resolution status (true/false)
- `update_epic`: Update epic title, description, status, assignment, and phases
- `archive_epic`: Archive epics (product managers only)

### User Story Management
- `create_user_stories`: Create multiple user stories with epic association, acceptance criteria, and story points
- `list_user_stories`: List user stories with filtering by epic, status, or assignee (excludes archived by default)
  - `dependencies_resolved`: Filter user stories by dependency resolution status (true/false)
- `update_user_story_content`: Update user story title, description, and story points (all stakeholders)
- `update_user_story_acceptance_criteria`: Update user story acceptance criteria (product managers only)
- `archive_user_story`: Archive user stories (product managers only)

### Task Management
- `create_tasks`: Create multiple tasks with user story association, time estimates, and architect/developer assignment
- `list_tasks`: List tasks with optional filtering by user story, status, assignee, and dependency relationships
  - `depends_on`: Filter tasks that depend on a specific task ID
  - `depended_by`: Filter tasks that are depended on by a specific task ID
  - `has_dependencies`: Filter tasks that have (true) or don't have (false) any dependencies
  - `dependencies_resolved`: Filter tasks by dependency resolution status (true/false)

### Bug Tracking
- `create_bugs`: Create multiple bug reports with severity levels, reporter, and assignee information
- `list_bugs`: List bugs with optional filtering by status, severity, reporter, assignee

### Test Case Management
- `create_test_cases`: Create multiple test cases with preconditions, steps, expected results, and tester/productmanager assignment
- `list_test_cases`: List test cases with optional filtering by status, assignee

### Workflow Management
- `update_entity_status`: Update status and/or assignment of any SDLC entity with audit trail recording and intelligent workflow suggestions
- `manage_story_dependencies`: Add or remove dependencies for multiple user stories in bulk
- `manage_epic_dependencies`: Add or remove dependencies for multiple epics in bulk
- `manage_task_dependencies`: Add or remove dependencies for multiple tasks in bulk (tasks must belong to same user story)

#### Intelligent Workflow Suggestions
The system provides intelligent workflow guidance across the entire SDLC:

- **Task Closure Intelligence**: When a task is moved to "Closed" status, the system automatically checks if all tasks in the user story are now closed
- **User Story Advancement**: If all tasks are closed and the user story is not already in QA/UAT/Closed status, the system suggests moving the user story to "QA" status
- **Task Dependency Intelligence**: When a task is closed, the system checks for dependent tasks and suggests moving them to "In Progress" if all their dependencies are satisfied
- **Bug Status Intelligence**: When bugs change status, the system provides targeted suggestions:
  - "Fixed" bugs: Suggest QA verification
  - "Closed" bugs: Check if regression tests exist, suggest creating if missing
  - "Open" bugs: Suggest developer reassignment if assigned to tester
- **User Story Validation**: Prevents moving user stories to "In Progress" without acceptance criteria and test cases
- **Proactive Guidance**: Helps teams maintain proper SDLC workflow without manual tracking

**Example Responses:**

*Task Dependency Intelligence:*
```json
{
  "success": true,
  "entity_type": "task",
  "entity_id": 5,
  "old_status": "Review",
  "new_status": "Closed",
  "workflow_suggestions": [
    {
      "entity_type": "task",
      "entity_id": 7,
      "suggested_action": "start_task",
      "reason": "All dependencies for task \"Implement API\" are now completed",
      "suggested_status": "In Progress"
    }
  ]
}
```

*Bug Status Intelligence:*
```json
{
  "success": true,
  "entity_type": "bug",
  "entity_id": 3,
  "old_status": "In Progress",
  "new_status": "Fixed",
  "workflow_suggestions": [
    {
      "entity_type": "bug",
      "entity_id": 3,
      "suggested_action": "qa_verification",
      "reason": "Bug has been marked as fixed and should be verified by QA",
      "suggested_status": "In Progress"
    }
  ]
}
```

*User Story Validation:*
```json
{
  "content": ["Please ask product manager to add acceptance criteria"],
  "structuredContent": {
    "success": false,
    "entity_type": "user_story",
    "entity_id": 1,
    "error": "Please ask product manager to add acceptance criteria"
  },
  "isError": true
}
```

### Comments Support
- `create_comments`: Create comments on any SDLC entity for stakeholder feedback
- `get_comments`: Retrieve comments for a specific SDLC entity

### Wiki Management
- `create_wiki_page`: Create wiki pages with Markdown content, tags, and category classification
- `update_wiki_page`: Update wiki page content, metadata, and tags
- `list_wiki_pages`: List wiki pages with filtering by category, tags, or search terms
- `get_wiki_page`: Get detailed wiki page content with linked entities
- `manage_wiki_links`: Add or remove links between wiki pages and SDLC entities

### Knowledge Graph Generation
- `get_knowledge_graph`: Generate and return the knowledge graph for the initialized project, analyzing Python, JavaScript/TypeScript, and Java files to extract imports, classes, functions, and dependencies

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

## HTTP API

The server also provides a REST API for web applications and direct HTTP access:

### Endpoints

- `GET /api/status`: Get database initialization status and server information
- `POST /api/initialize`: Initialize database with project location
  - Request: `{"currentProjectLocation": "/path/to/project"}`
  - Response: Database connection status
- `GET /api/epics`: List all epics with comment counts and dependencies
- `GET /api/epic/:id`: Get specific epic details
- `GET /api/story/:id`: Get specific user story details
- `GET /api/task/:id`: Get specific task details
- `GET /api/bug/:id`: Get specific bug details
- `GET /api/test-case/:id`: Get specific test case details
- `GET /api/comments/:entityType/:entityId`: Get comments for any entity
- `GET /api/wiki`: List all wiki pages with metadata and tags
- `GET /api/wiki/:id`: Get specific wiki page with full content and linked entities
- `GET /api/wiki/search?q=term`: Search wiki pages by title or content
- `GET /api/get-knowledge-graph`: Generate and retrieve knowledge graph data for the initialized project
  - Response: JSON object with tree structure and file analysis

### Features
- **Comment Counts**: All entities include `comment_count` field
- **Dependency Information**: Epics and user stories include dependency arrays
- **Boolean Fields**: Proper boolean values (true/false) for archived fields
- **JSON Responses**: All endpoints return structured JSON data

## Resources Available

- `database_schema`: Provides information about the database schema and table structures

## Knowledge Graph

The knowledge graph tools analyze project codebases to create structured representations of the codebase:

### Supported Languages
- **Python** (.py): Extracts imports, classes, functions, and function calls
- **JavaScript/TypeScript** (.js, .ts, .jsx, .tsx): Extracts ES6/CommonJS imports, classes, functions, and calls
- **Java** (.java): Extracts imports, classes, methods, and method calls

### Output Format
The knowledge graph is saved as `.kg.json` in the project root and contains:
```json
{
  "t": "Project tree structure as text",
  "f": [
    {
      "f": "relative/file/path",
      "i": ["import1", "import2"],
      "c": ["Class1", "Class2"],
      "fn": ["function1", "function2"],
      "ca": ["call1", "call2"]
    }
  ]
}
```

### Usage
- Automatically excludes build directories, node_modules, and generated files
- Requires project initialization first (like other tools)
- Generates knowledge graph at runtime without storing files
- Can be used for code analysis, dependency visualization, and project understanding

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

Before using any other tools, you must initialize the database. You have two options:

#### Option 1: MCP Tool (Recommended for AI Agents)
1. Call the `initialize` tool and provide your current working directory path (e.g., "/Users/username/project")
2. The tool will create `.project_tracker.db` in that directory and set up all necessary tables

#### Option 2: HTTP API (For Web Applications)
1. Start the server: `npm start`
2. Call `POST /api/initialize` with: `{"currentProjectLocation": "/path/to/project"}`
3. The API will create `.project_tracker.db` and establish the database connection

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

### Web UI Access

The server also provides a web-based dashboard interface:

```bash
npm start
# Then visit the URL shown in the console (typically http://localhost:3000)
```

**Web UI Features:**
- **Tabbed Interface**: Separate SDLC Tracker and Wiki sections
- **Dashboard Overview**: Visual representation of all SDLC entities
- **Wiki Browsing**: Card-based wiki page display with metadata and tags
- **Dependency Visualization**: Clickable dependency links for epics and user stories
- **Comment Counts**: Display of comment counts on all entities
- **Interactive Navigation**: Click entities to view detailed information
- **Wiki Page Rendering**: Full Markdown support with linked SDLC entities
- **Real-time Updates**: Automatic refresh of data changes

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
- `archived`: Boolean flag for soft deletion
- `dependencies`: Array of epic IDs this epic depends on
- `dependent_epics`: Array of epic IDs that depend on this epic
- `dependencies_resolved`: Boolean indicating if all dependencies are 'Closed'
- `comment_count`: Number of comments on this epic

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
- `archived`: Boolean flag for soft deletion
- `dependencies`: Array of story IDs this story depends on
- `dependent_stories`: Array of story IDs that depend on this story
- `dependencies_resolved`: Boolean indicating if all dependencies are 'Closed'
- `comment_count`: Number of comments on this story

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
- `dependencies_resolved`: Boolean indicating if all dependencies are 'Closed'
- `comment_count`: Number of comments on this task

#### Bugs Table
- `id`: Primary key (auto-increment)
- `user_story_id/task_id`: Foreign keys (optional)
- `title`: Bug title (required)
- `description`: Bug description (optional)
- `severity`: Severity level ('Critical', 'High', 'Medium', 'Low')
- `status`: Status ('Open', 'In Progress', 'Review', 'Fixed', 'Closed')
- `reported_by/assigned_to/created_by/current_owner`: Stakeholder assignments (enum)
- `phase`: Phase name (optional, nullable)
- `phase_status`: Phase completion status (optional, defaults to 'Open')
- `created_at/updated_at/fixed_at/closed_at`: Timestamps
- `comment_count`: Number of comments on this bug

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
- `comment_count`: Number of comments on this test case

#### Story Dependencies Table
- `id`: Primary key (auto-increment)
- `dependent_story_id`: Foreign key to user_stories (story that depends on another)
- `dependency_story_id`: Foreign key to user_stories (story being depended upon)
- `created_at`: Timestamp when dependency was created
- `created_by`: Stakeholder who created the dependency
- **Constraints**: No self-dependencies, no duplicate dependencies, cascade delete

#### Epic Dependencies Table
- `id`: Primary key (auto-increment)
- `dependent_epic_id`: Foreign key to epics (epic that depends on another)
- `dependency_epic_id`: Foreign key to epics (epic being depended upon)
- `created_at`: Timestamp when dependency was created
- `created_by`: Stakeholder who created the dependency
- **Constraints**: No self-dependencies, no duplicate dependencies, cascade delete

#### Task Dependencies Table
- `id`: Primary key (auto-increment)
- `dependent_task_id`: Foreign key to tasks (task that depends on another)
- `dependency_task_id`: Foreign key to tasks (task being depended upon)
- `created_at`: Timestamp when dependency was created
- `created_by`: Stakeholder who created the dependency
- **Constraints**: No self-dependencies, no duplicate dependencies, cascade delete, same user story validation

#### Comments Table
- `id`: Primary key (auto-increment)
- `entity_type`: Type of entity ('epic', 'user_story', 'task', 'bug', 'test_case')
- `entity_id`: Foreign key to the entity
- `comment_text`: Comment content (required)
- `author`: Comment author stakeholder (enum)
- `created_at/updated_at`: Timestamps

#### Wiki Pages Table
- `id`: Primary key (auto-increment)
- `title`: Wiki page title (required, unique)
- `content`: Markdown content (required)
- `category`: Category classification ('technical', 'process', 'requirements', 'architecture', 'other')
- `tags`: Array of tag strings for organization
- `created_by/updated_by`: Stakeholder who created/updated the page
- `created_at/updated_at`: Timestamps

#### Wiki Links Table
- `id`: Primary key (auto-increment)
- `wiki_page_id`: Foreign key to wiki_pages
- `entity_type`: Linked entity type ('epic', 'user_story', 'task', 'bug', 'test_case')
- `entity_id`: Foreign key to the linked entity
- `created_at`: Timestamp when link was created
- `created_by`: Stakeholder who created the link

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
  - **Validation**: Cannot move to 'In Progress' without acceptance criteria and test cases
- **Tasks**: New → In Progress → Review → Closed (architect → developer → architect)
- **Bugs**: Open → In Progress → Review → Fixed → Closed (any stakeholder can be involved)
  - **Validation**: 'Review' can only be set from 'In Progress', cannot jump directly to 'Fixed'
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

### Epic Dependencies
Epics can have dependencies on other epics to model complex project relationships:
- **Many-to-Many Relationships**: One epic can depend on multiple epics, and multiple epics can depend on one epic
- **Dependency Validation**: Prevents circular dependencies and self-dependencies
- **Bulk Management**: Add/remove dependencies for multiple epics in single operations
- **Visual Indicators**: Dependency counts shown in UI with clickable links
- **API Support**: Full REST API support for epic dependency management

### Task Dependencies
Tasks can have dependencies on other tasks within the same user story to model task execution order:
- **Same User Story Constraint**: Tasks can only depend on other tasks within the same user story
- **Dependency Validation**: Prevents circular dependencies, self-dependencies, and cross-story dependencies
- **Bulk Management**: Add/remove dependencies for multiple tasks in single operations
- **Visual Indicators**: Dependency counts shown in UI with clickable links
- **API Support**: Full MCP API support for task dependency management

### Dependencies Resolved Status
All list operations (`list_epics`, `list_user_stories`, `list_tasks`) include a `dependencies_resolved` boolean field that indicates whether all dependencies of an entity are in 'Closed' status:
- **Dynamic Calculation**: Computed in real-time when listing entities
- **Filtering Support**: All list operations support `dependencies_resolved` filter parameter
- **Workflow Visibility**: Helps teams identify entities ready for work
- **API Integration**: Available in both MCP tools and REST API endpoints

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

### Epic Dependencies
14. "Add dependencies: Epic 2 depends on Epic 1, Epic 3 depends on Epic 2"
15. "Remove dependency: Epic 3 no longer depends on Epic 2"
16. "List epics with dependency information"

### Bug Tracking
7. "Create bugs: 'Login fails on mobile devices' (Critical, reported by tester) and 'Password reset email not sent' (High, reported by productmanager)" (Note: User story and task references are validated if provided)
8. "List all open bugs with high severity"

### Test Case Creation
9. "Create test cases: 'Verify user can login successfully' and 'Verify password reset works' for user story 1" (Note: User story references are validated if provided)
10. "List test cases that have failed"

### Comments and Collaboration
11. "Add comment on user story 1: 'Need to ensure security best practices' by architect"
12. "Add comment on bug 1: 'Validation should check email format' by developer"

### Wiki Documentation
13. "Create wiki page: 'API Authentication Guide' with content about OAuth2 flow, category 'technical', tags ['authentication', 'security', 'api']"
14. "Create wiki page: 'Deployment Process' with step-by-step deployment instructions, category 'process', tags ['deployment', 'ci-cd']"
15. "List all wiki pages in technical category"
16. "Update wiki page content for 'API Authentication Guide' with additional OAuth2 details"
17. "Link wiki page 'API Authentication Guide' to user story 1 and task 2"
18. "Search wiki pages for 'authentication'"

### Workflow Management
13. "Update user story 1 status to 'In Progress' transitioned by architect"
14. "Update task 1 status to 'Closed' transitioned by developer"

### Dependencies Resolved Filtering
15. "List epics with all dependencies resolved"
16. "List user stories that have unresolved dependencies"
17. "List tasks ready to start (dependencies resolved)"

### Knowledge Graph Generation
18. "Get knowledge graph data for the initialized project"

### Bug Status Management
18. "Update bug 1 status to 'Review' (must come from 'In Progress')"
19. "Update bug 2 status to 'Fixed' (triggers QA verification suggestion)"

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

- **Wiki System**: Complete wiki functionality with Markdown pages, tags, categories, and SDLC entity linking
- **Tabbed Web UI**: Enhanced dashboard with separate SDLC Tracker and Wiki sections
- **Wiki API**: Full REST API for wiki page management and search
- **Comment Count Display**: All entities now show comment counts in APIs and MCP tools
- **Boolean Field Conversion**: Proper boolean handling for archived fields (true/false)
- **Epic Dependencies**: Full dependency support for epics (similar to user stories)
- **HTTP API**: REST endpoints for database initialization and entity access
- **Web UI Enhancements**: Epic dependency visualization in dashboard
- **Enhanced Error Handling**: Comprehensive validation with clear error messages
- **Foreign Key Validation**: All entity references are validated before database operations
- **Consistent API Responses**: All list tools now use standardized response format
- **Improved Data Integrity**: Better constraint checking and error reporting
- **Dependencies Resolved Status**: Dynamic calculation and filtering for epic, user story, and task dependencies
- **Bug Status Enhancement**: Added 'Review' status with strict transition validation (In Progress → Review → Fixed)
- **Advanced Workflow Intelligence**: Task dependency suggestions, bug status intelligence, and user story validation
- **Enhanced Filtering**: dependencies_resolved filter parameter across all list operations

## License

ISC