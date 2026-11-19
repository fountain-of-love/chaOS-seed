Feature: Reflection and learned context

  Scenario: Relation weight determines the growth stage
    Then weights produce these growth stages:
      | weight | stage    |
      | 1      | none     |
      | 2      | dance    |
      | 5      | noticed  |
      | 10     | routine  |
      | 25     | governed |
      | 26     | re-seed  |

  Scenario: Variation checks follow the growth sequence
    Then the variation checks from prompt 0 through 49 occur at "2,6,8,14,22,36"

  Scenario: Context includes the spiral and only relations that reached noticed
    Given these relations:
      """json
      [
        {"from":"ship it","type":"follows","to":"run the tests","weight":4,"evidence":[]},
        {"from":"once","type":"follows","to":"only","weight":3,"evidence":[]}
      ]
      """
    When I build context after 1 prompts with a reflection interval of 10
    Then the context mentions "intent"
    And the context mentions "ship it → follows → run the tests (4, noticed)"
    And the context omits "once"
    And the context omits "Reflection is due"
    And the context omits "Variation check"

  Scenario: Reflection is due at positive multiples of the interval
    Then with a reflection interval of 10 these counts are due:
      | count | due   |
      | 0     | false |
      | 9     | false |
      | 10    | true  |
    When I build context after 10 prompts with a reflection interval of 10
    Then the context mentions "Reflection is due"

  Scenario: Context asks about variation only at the designated counts
    When I build context after 6 prompts with a reflection interval of 10
    Then the context mentions "Variation check"
    When I build context after 7 prompts with a reflection interval of 10
    Then the context omits "Variation check"

  Scenario: Only the opening line can set the reply's intent
    Then these replies state the following intents:
      """json
      [
        ["intent: tidy the README\n\nDone.", "tidy the README"],
        ["Done.\nintent: quoted later", null],
        ["", null]
      ]
      """

  Scenario: Distinct evidence strengthens relations without mutating the original
    When I strengthen memory with:
      """json
      {
        "before":[{"from":"a","type":"follows","to":"b","weight":1,"evidence":["e-1"]}],
        "first":{"relation":{"from":"a","type":"follows","to":"b"},"evidence":["e-2","e-2","e-1"]},
        "second":{"relation":{"from":"c","type":"follows","to":"d"},"evidence":["e-3","e-4"]}
      }
      """
    Then the original relations are unchanged
    And the strengthened memory has these weights and citations:
      | relation     | weight | evidence |
      | a follows b  | 2      | e-1,e-2  |
      | c follows d  | 2      | e-3,e-4  |

  Scenario: Review groups daily prompts and normalized repeats with evidence
    When I review these events from "2026-11-18T00:00:00.000Z":
      | id  | at                       | type   | text             |
      | e-0 | 2026-11-17T09:00:00.000Z | prompt | old              |
      | e-1 | 2026-11-18T09:00:00.000Z | prompt | Run the tests    |
      | e-2 | 2026-11-18T10:00:00.000Z | reply  | ok               |
      | e-3 | 2026-11-19T09:05:00.000Z | prompt | run  the tests   |
      | e-4 | 2026-11-19T09:05:00.000Z | prompt | something new    |
    Then the result is:
      """json
      {
        "prompts":3,
        "byDay":{"2026-11-18":1,"2026-11-19":2},
        "repeats":[{"text":"run the tests","count":2,"evidence":["e-1","e-3"]}]
      }
      """
