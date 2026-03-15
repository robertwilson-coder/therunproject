# The Run Project - Technical Overview

## Project Summary
The Run Project is an AI-powered running training platform that generates personalized, adaptive training plans for runners of all levels. The application uses AI to create custom training schedules, provides real-time chat-based coaching, and tracks progress with comprehensive analytics.

## Tech Stack
- **Frontend**: React 18 + TypeScript, Vite, TailwindCSS
- **Backend**: Supabase (PostgreSQL database, Edge Functions, Authentication)
- **AI Integration**: OpenAI API (via Supabase Edge Functions)
- **Wearable Integrations**: Garmin Connect (OAuth2)
- **Additional Libraries**: Recharts (charts), jsPDF (PDF export), Lucide React (icons)

## Application Architecture

### Frontend Structure
The app uses a single-page application (SPA) architecture with lazy-loaded components for performance:
- **App.tsx**: Main orchestrator managing application state (landing, questionnaire, viewPlan, savedPlans)
- **Contexts**: AuthContext (user authentication), ThemeContext (dark mode), ToastContext (notifications)
- **Custom Hooks**: usePlanManagement (plan CRUD operations), useNavigationState (UI navigation), useWorkoutOperations (workout tracking)
- **Components**: 40+ React components organized by feature (training plans, dashboard, analytics, social features)

### Backend Structure (Supabase)
**Edge Functions** (18 serverless functions):
- `generate-preview-plan`: Creates initial 2-week preview using AI
- `generate-training-plan`: Generates full personalized training plan
- `chat-training-plan`: AI chat interface for plan modifications
- `accept-preview-plan`: Converts preview to full plan generation job
- `process-plan-job`: Async job processor for plan generation
- `regenerate-plan-from-calibration`: Updates plan based on calibration run results
- `submit-workout-feedback`: Processes workout completion and triggers coach interventions
- Garmin integration (OAuth, sync workouts/activities)
- Email/notification services (welcome emails, workout reminders, Discord webhooks)

**Database Schema** (50+ migrations):
- `training_plans`: Stores user plans with answers, plan_data (JSON), chat_history, training paces
- `workout_completions`: Tracks completed workouts with RPE, distance, duration, enjoyment
- `workout_feedback`: AI-generated feedback for completed workouts
- `calibration_completions`: Stores calibration run data for pace calculation
- `user_streaks`: Per-plan streak tracking
- `badges`: Achievement system
- `notifications`: In-app notification center
- `race_buddies`: Social feature for connecting runners
- Recovery tracking (sleep, heart rate, injuries)
- Nutrition tracking (fueling strategies, hydration)
- Performance analytics views (aggregated workout data)

## Core Features

### 1. AI-Powered Plan Generation
**Two-Stage Process**:
- **Stage 1**: User completes questionnaire (experience, race distance, available days, current fitness, injuries)
- **Stage 2**: AI generates preview (2 weeks) instantly, then full plan asynchronously
- Plans are normalized to "canonical days format" (daily structure with ISO dates)
- Includes training paces calculated from recent race times or calibration runs

### 2. Calibration System
- Optional 20-30 min test run to assess current fitness
- Analyzes: pace, consistency, splits, elevation, heart rate
- AI validates calibration quality and adjusts training paces accordingly
- Results stored for future plan regeneration

### 3. Chat-Based Plan Modifications
**Patch System**:
- Users can chat with AI to modify their plan ("move tomorrow's workout", "reduce mileage next week")
- AI analyzes request scope (single day, range, whole plan)
- Returns structured patches (add/update/delete operations)
- Frontend applies patches and syncs to database
- Full chat history maintained for context

### 4. Coach Interventions
**Automated feedback system**:
- Monitors RPE deviations (if actual RPE differs significantly from expected)
- Detects workout cancellations, skipped workouts
- AI generates personalized coaching messages
- Messages appear as "coach interventions" in chat interface
- Prevents duplicate interventions with metadata tracking

### 5. Workout Tracking
- Mark workouts complete with RPE (1-10 scale), distance, duration, notes
- Track enjoyment level (5-point scale)
- Receives AI-generated feedback after completion
- Updates streak counters and badges
- Charts show progress over time (weekly mileage, RPE trends, completion rates)

### 6. Progress & Analytics
- **Streaks & Badges**: Gamification with achievement system
- **Performance Analytics**: Weekly volume, intensity distribution, workout type breakdown
- **Progress Charts**: Visual tracking with Recharts (line/bar charts)
- **Steps Progress**: Shows plan progress with visual indicators

### 7. Additional Features
- **Dashboard**: Central hub for all tools (pace calculator, HR zones, recovery, nutrition)
- **PDF Export**: Generate printable training plan
- **Garmin Sync**: Auto-import workouts from Garmin Connect
- **Race Day Planning**: Set goals and pacing strategies
- **Social Hub**: Connect with race buddies, share workouts
- **Dark Mode**: Full theme support
- **Offline Support**: Service worker for offline access
- **Notifications**: In-app notification center with email integration

## Key User Flows

### New User Journey
1. Land on homepage → "Create New Plan"
2. Complete questionnaire (8-12 questions based on experience level)
3. Receive instant 2-week preview
4. Optional: Sign up to save and get full plan
5. Full plan generates asynchronously (shown in "My Plans" with status)
6. View complete plan with calendar, chat, and workout tracking

### Existing User Journey
1. Login → "My Plans"
2. View active plans with progress indicators
3. Click plan → See full calendar with workouts
4. Complete workouts → Mark done with RPE/notes
5. Receive AI feedback and coach interventions
6. Chat to modify plan as needed
7. Track progress in Dashboard analytics

### Plan Modification Flow
1. Open chat in plan view
2. Type request: "Can you move tomorrow's long run to Sunday?"
3. AI analyzes request scope and generates patch
4. User sees proposed changes highlighted in green
5. Click "Approve Changes" to apply
6. Plan updates immediately, syncs to database

## Technical Highlights

### State Management
- React Context for global state (auth, theme, toasts)
- Custom hooks for complex logic (plan operations, modifications)
- Local state in components for UI interactions

### Data Normalization
- All plans stored in "canonical days format" (array of day objects with ISO dates)
- Legacy week-based format converted on load
- Enables precise date-based operations and modifications

### AI Integration
- All AI calls routed through Supabase Edge Functions (keeps API keys secure)
- Structured prompts with context (user profile, plan history, chat history)
- JSON-mode responses for structured data (patches, plans, feedback)
- Rate limiting to prevent abuse

### Security
- Row Level Security (RLS) on all database tables
- Users can only access their own data
- Service role key used only in Edge Functions
- Authentication via Supabase Auth (email/password)

### Performance Optimizations
- Lazy loading for heavy components (Dashboard, Analytics, Charts)
- Database indexes on frequently queried columns
- Materialized views for aggregated analytics
- Debounced search and filters

## Future Enhancement Opportunities
- Strava integration (similar to Garmin)
- Mobile app (React Native or native)
- Group training plans for running clubs
- Marketplace for coach-created plans
- Video library for running form/drills
- Integration with more wearables (Apple Watch, Polar, Whoop)
- Advanced analytics (ML-based injury prediction, fatigue modeling)
- Community features (forums, challenges, leaderboards)
