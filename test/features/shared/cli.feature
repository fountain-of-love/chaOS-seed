Feature: The spiral command line

  Background:
    Given this prompt history:
      | id  | at                       | text          |
      | e-0 | 2000-01-18T09:00:00.000Z | run the tests |
      | e-1 | 2000-01-18T09:01:00.000Z | Run the tests |
      | e-2 | 2000-01-18T09:02:00.000Z | ship it       |

  Scenario: Review reports repeated prompts and their evidence
    When I run "review"
    Then it exits with code 0
    And stdout contains "3 prompts"
    And stdout contains "2× run the tests (e-0 e-1)"

  Scenario: Reflect gives the agent a review and clear next commands
    When I run "reflect"
    Then it exits with code 0
    And stdout contains "run the tests"
    And stdout contains "spiral remember"
    And stdout contains "spiral reflected"

  Scenario: Marking reflection resets the counter and records when it happened
    When I run "reflected"
    Then it exits with code 0
    And the prompt count is 0 at version 4
    And the reflection event caused both state updates
    When I run "review"
    Then stdout contains "0 prompts"

  Scenario: Remember strengthens a relation with cited and newly recorded evidence
    When I run "remember" with these arguments:
      """json
      ["ship it","follows","run the tests","--evidence","e-0,e-1"]
      """
    Then it exits with code 0
    When I run "remember" with these arguments:
      """json
      ["ship it","follows","run the tests"]
      """
    Then it exits with code 0
    And the relation weighs 3 and has 3 evidence events
    When I run "memory"
    Then stdout contains "3  ship it → follows → run the tests (dance)"

  Scenario: Invalid relations leave no memory or remember event behind
    When I run "remember" with these arguments:
      """json
      ["a","Not A Type","b"]
      """
    Then it exits with code 1
    And stderr contains "type"
    And no memory file was created
    And the journal has no "remember" event

  Scenario: Status shows the counter and the default trigger
    When I run "status"
    Then stdout contains "3 of 14 prompts"

  Scenario: Unsafe DOT writes preserve the existing memory and journal
    When I run "remember" with these arguments:
      """json
      ["a","follows","b"]
      """
    Then it exits with code 0
    Given I snapshot the memory and journal
    When I run "remember" with these arguments:
      """json
      ["one\ntwo","follows","b"]
      """
    Then it exits with code 1
    And stderr contains "single-line"
    And memory and the journal match the snapshot
    Given I add the unsupported edge "c -> d;" to memory
    And I snapshot the memory and journal
    When I run "remember" with these arguments:
      """json
      ["c","follows","d"]
      """
    Then it exits with code 1
    And stderr contains "unreadable relations"
    And memory and the journal match the snapshot

  Scenario: Concurrent remember commands retain every citation
    When 8 writers cite different evidence for "ship it" follows "run the tests"
    Then the relation weighs 8 and has 8 evidence events
    And the relation cites "e-0,e-1,e-2,e-3,e-4,e-5,e-6,e-7"
