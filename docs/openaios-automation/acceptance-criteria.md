# Acceptance Criteria — @openaios/automation

## AC1: CronScheduler
**Given** a CronScheduler with job { name: "daily", agent: "assistant", schedule: "0 9 * * MON-FRI", message: "Generate report" }
**When** the scheduler ticks at 09:00 on a Monday
**Then** the dispatch callback is called with { agentName: "assistant", message: "Generate report" }

**Given** a scheduler with a job
**When** start() is called then stop() is called
**Then** no more jobs fire after stop

## AC2: JobHistory
**Given** a JobHistory
**When** a job executes, record() is called
**Then** the execution is persisted with status, duration, error
**When** list({ jobName: "daily" }) is called
**Then** it returns matching entries ordered by time desc

## AC3: WebhookReceiver
**Given** a WebhookReceiver for path "/hooks/github" with token
**When** a POST arrives with correct Authorization header
**Then** the dispatch callback is called with the parsed body
**When** the same idempotency key arrives twice
**Then** the second request returns 200 but does NOT dispatch again

**Given** a POST with wrong/missing token
**Then** it returns 401

## AC4: Dispatcher
**Given** a Dispatcher with a dispatch callback
**When** dispatchCron(job) is called
**Then** it generates a sessionKey like "cron:{jobName}" and calls the callback

## AC5: Config backward compatibility
**Given** an existing openAIOS.yml with no `automation:` section
**When** loaded → config loads successfully
