Feature: Journal integrity

  Scenario: A refused event is recorded separately
    When I try to record a prompt as "robot"
    Then the event is refused
    And the journal has no valid events
    And the rejection identifies "actor.role"

  Scenario: A writer can recover after a lock owner exits unexpectedly
    Given a writer exits while holding the workspace lock
    When I try to record a prompt as "person"
    Then the journal contains the newly recorded event
