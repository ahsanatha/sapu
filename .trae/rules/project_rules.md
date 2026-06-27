db-dev: 
  - name: acq
    host: localhost
    port: 5432
    user: ahsanathallah
    database: postgres

# ACQ v3 Design Principles (Staff-Level Engineering)

## Core Philosophy: "Configuration over Code"
- Every line of code costs money - minimize code footprint
- Database entities define behavior, not TypeScript classes
- Generic, data-driven processors replace hardcoded logic
- Target: 500 lines of code total (down from 2000+)

## Entity-Driven Architecture
- All business logic lives in database as JSON configurations
- Code is purely execution engine - reads config, executes actions
- No hardcoded business rules, schedules, or complex logic
- Database becomes the "brain", code becomes the "executor"

## Simplicity Rules
1. **Single Engine**: One main process reads DB config and executes
2. **Generic Plugins**: Minimal, configurable processors for scraping/notifications
3. **JSON Configuration**: All settings, rules, workflows in database JSON fields
4. **Event-Driven**: Simple event system based on database triggers
5. **No Classes**: Functional approach with minimal abstractions

## Cost Optimization
- Eliminate complex TypeScript classes and business logic
- Move scheduling, auto-scaling, notifications to database configuration
- Use generic processors that read behavior from database entities
- Minimize dependencies and code complexity