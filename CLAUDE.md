#CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kumarajiva is a Remix-based full-stack application for Buddhist text translation and glossary management. It integrates AI workflows for translation assistance and provides collaborative tools for managing Buddhist sutras and terminology.

## Development Commands

### Core Development

- `pnpm dev` - Start development server (runs on http://localhost:3000)
- `pnpm build` - Build for production
- `pnpm typecheck` - TypeScript type checking
- `pnpm lint` - ESLint with max 1 warning allowed

### Database Operations

- `pnpm db:push` - Push schema changes to database
- `pnpm db:migrate` - Run database migrations
- `pnpm db:studio` - Open Drizzle Studio for database inspection
- `pnpm db:seed` - Seed development data
- `pnpm db:seed:prod` - Seed production data (requires .env.prod)

### AI/Mastra Workflows

- `pnpm mastra:dev` - Start Mastra development server
- `pnpm mastra:build` - Build Mastra workflows for production

### Testing

- `pnpm playwright:test:headed` - Run E2E tests with browser UI
- `pnpm playwright:codegen` - Generate Playwright test code
- `pnpm playwright:teardown` - Run teardown scripts

### Utility Scripts

- `pnpm get-hash-password` - Generate bcrypt password hashes
- `pnpm read-glossary` - Process glossary data from files
- `pnpm transformation` - Run text transformation scripts

## Architecture

### Tech Stack

- **Frontend**: Remix + React 18 + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui components
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Remix Auth (Form + Google OAuth)
- **Authorization**: CASL for role-based permissions
- **AI**: Mastra framework with Anthropic/OpenAI integration
- **Deployment**: Vercel with Node.js >=22.14.0

### Key Directories

- `app/routes/` - File-based routing with `_app.*` for protected routes and `_auth.*` for authentication
- `app/components/ui/` - shadcn/ui components
- `app/services/` - Business logic services
- `app/authorisation/` - CASL authorization logic
- `drizzle/` - Database schema, migrations, and seeds
- `mastra/` - AI agents, tools, and workflows
- `e2e/` - Playwright end-to-end tests

### Database Architecture

Core entities: Teams → Users → Sutras → Rolls → Paragraphs, with supporting tables for Glossaries, References, Comments, and Notifications. Uses Drizzle ORM with PostgreSQL.

### Authentication Flow

Multi-provider authentication (Form + Google) with session-based auth. Protected routes use `_app.*` naming convention and require authentication middleware.

## Development Workflow

1. **Environment Setup**: Requires multiple .env files (dev, prod)
2. **Database First**: Use Drizzle migrations for schema changes
3. **Code Quality**: Pre-commit hooks with husky and lint-staged
4. **Testing**: Playwright E2E tests with authentication state persistence
5. **AI Integration**: Mastra workflows handle translation and text processing

## Common Patterns

### Route Structure

- `_app.*.tsx` - Protected application routes
- `_auth.*.tsx` - Authentication-related routes
- Use Remix loaders/actions for data fetching and mutations

### Component Organization

- Import UI components from `~/components/ui/`
- Use `clsx` and `tailwind-merge` for conditional styling
- Follow shadcn/ui patterns for component composition

### Database Operations

- Use Drizzle queries in route loaders/actions
- Seed data is available for both dev and production environments
- Always run migrations before deployment

## Package Manager

This project uses **pnpm** (v9.7.0) exclusively. Always use `pnpm` commands, not npm or yarn.

## Testing Notes

Playwright tests run against http://localhost:3000 in development and against the preview deployment in CI. Tests include authentication state setup/teardown and use Vercel protection bypass headers for CI environments.

## Linter and Code Quality Tips

- For linter error, if the linter error is out of order, save file can resolve this linter error, if not this type of error, you have to resolve it.

## Code Architecture Recommendations

- Make sure UI and business code is decoupled, use hooks to put same unit of business logic together.
- Create a folder for a new UI component, create new folder called hooks under that folder, if hook is required for that component.

## React Patterns

### Conditional Rendering Principle

- **Principle**: Use separate return statements for different logic branches instead of complex conditional rendering within a single return statement.

- **Benefits**:
  - Improved Readability: Each logic path is clearly separated and easier to follow
  - Reduced Nesting: Eliminates deeply nested ternary operators and conditional JSX
  - Better Maintainability: Adding new conditions or modifying existing ones is simpler
  - Cleaner Code: Each return statement focuses on a single responsibility

- **Pattern**:
  ```typescript
  // ❌ Avoid: Complex conditional rendering in single return
  function Component({ data }) {
    return (
      <>
        {data.length > 0 ? (
          <ComplexUI>
            {/* Lots of nested JSX */}
          </ComplexUI>
        ) : (
          <EmptyState />
        )}
      </>
    );
  }

  // ✅ Prefer: Early returns for different states
  function Component({ data }) {
    // Handle empty state first
    if (data.length === 0) {
      return <EmptyState />;
    }

    // Handle main state
    return <ComplexUI />;
  }
  ```

- **When to Apply**:
  - Components with multiple distinct UI states (loading, empty, error, success)
  - Complex conditional rendering logic
  - When ternary operators become nested or hard to read

## Development Cycle Guidelines

- The development cycle involves the following steps:
  - First, develop the feature
  - Run typecheck to ensure no TypeScript type errors
  - Lint the code and fix any linter errors
  - Write unit tests for functionality like hooks and custom utility functions (not for UI components)
  - Run unit tests and ensure all tests pass

## Type Usage Guidelines

- Try your best to avoid using any type
