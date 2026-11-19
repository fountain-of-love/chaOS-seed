Feature: Agent hook behavior

  Scenario: Submitting a prompt journals it and returns agent context
    When session "s1" submits the prompt "Tidy the README"
    Then it exits with code 0
    And the hook response is for "UserPromptSubmit"
    And the context mentions "intent"
    And the last journal entry has these fields:
      """json
      {"type":"prompt","actor":{"role":"person","session":"s1"},"data":{"text":"Tidy the README"}}
      """

  Scenario: Each prompt raises the counter and registers the event that changed it
    When I submit "one"
    And I submit "two"
    Then the prompt count is 2 at version 2
    And the last prompt caused the counter update
    And the state body includes these headings:
      | heading  |
      | What     |
      | Why      |
      | Who      |
      | Where    |
      | When     |
      | How      |
      | How much |

  Scenario: Updating a state preserves custom metadata and the edited body
    When I submit "one"
    Given I set state metadata "owner" to "team" and append this note:
      """
      My own words.
      """
    When I submit "two"
    Then the prompt count is 2 at version 2
    And the edited state body and extra metadata are unchanged

  Scenario: The prompt hook signals reflection and returns learned relations
    Given reflection is due every 3 prompts
    And this memory graph is stored:
      """
      digraph memory {
        "person" -> "small steps" [type="prefers", weight=4, evidence="e-1 e-2 e-3 e-4"];
      }
      """
    When I submit "p0"
    And I submit "p1"
    And I submit "p2"
    Then the context mentions "Reflection is due"
    And the context mentions "person → prefers → small steps (4, noticed)"

  Scenario: The stop hook records the reply and its opening intent
    When session "s1" ends with this reply:
      """
      intent: tidy the README

      Done.
      """
    Then it exits with code 0
    And the last journal entry has these fields:
      """json
      {
        "type":"reply",
        "actor":{"role":"agent","session":"s1"},
        "data":{"intent":"tidy the README","text":"intent: tidy the README\n\nDone."}
      }
      """

  Scenario: Invalid hook JSON fails open and diagnostics are opt-in
    When the prompt hook receives raw input "not json"
    Then it exits with code 0
    And stdout and stderr are empty
    And the workspace has no spiral files
    Given hook debugging is enabled
    When the prompt hook receives raw input "not json"
    Then it exits with code 0
    And stdout is empty
    And stderr contains "spiral-hook:"

  Scenario: Concurrent prompts keep the journal and counter in sync
    When 16 prompts are submitted concurrently
    Then the journal contains 16 events
    And the prompt count is 16 at version 16
    And exactly 1 hook response mentions "Reflection is due"
