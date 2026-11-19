Feature: Runtimes contribute to a shared workspace

  Scenario Outline: <writer> starts a workspace and <follower> continues it
    Given I use "<writer>"
    And reflection is due every 2 prompts
    When session "s1" submits the prompt "Relire les tests"
    And session "s1" submits the prompt "Relire les tests"
    And I save the hook context
    And I run "reflected"
    Then it exits with code 0
    Given I set state metadata "owner" to "team" and append this note:
      """
      Notes de réflexion.
      """
    And I use "<follower>"
    When session "s1" submits the prompt "Relire les tests"
    And session "s1" submits the prompt "Relire les tests"
    Then the hook context matches the saved context
    And the edited state body and extra metadata are unchanged
    When session "s1" ends with this reply:
      """
      intent: relire les tests

      Fini.
      """
    Then the last journal entry has these fields:
      """json
      {"actor":{"role":"agent","session":"s1"},"data":{"intent":"relire les tests","text":"intent: relire les tests\n\nFini."}}
      """
    Given I use "<writer>"
    When I remember this relation citing prompts 1 through 2:
      """json
      ["terminer \"ça\"","follows","relire \\tests"]
      """
    Given I use "<follower>"
    When I remember this relation citing prompts 2 through 4:
      """json
      ["terminer \"ça\"","follows","relire \\tests"]
      """
    Then the relation weighs 4 and has 4 evidence events
    And both runtimes agree on these commands:
      | command |
      | status  |
      | review  |
      | reflect |
      | memory  |
    Given I use "<writer>"
    When I submit "Apply learned memory"
    Then the context mentions "4, noticed"
    Given I use "<follower>"
    When I run "reflected"
    Then it exits with code 0
    Given I use "<writer>"
    When I run "status"
    Then stdout contains "0 of 14 prompts"

    Examples:
      | writer | follower |
      | node   | python   |
      | python | node     |
