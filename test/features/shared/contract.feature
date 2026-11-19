Feature: The shared record contract

  Scenario: The application can run using local modules and the standard library
    Then the runtime has no external application imports

  Scenario: Record schemas agree with the contract document
    Then the required fields of each record match CONTRACT.md

  Rule: Validation accepts extensions and explains invalid records

    Background:
      Given these example records:
        """json
        {
          "event": {"id":"e-1a2b-c3d4","at":"2026-11-19T09:00:00.000Z","type":"prompt","actor":{"role":"person","session":"s1"},"data":{"text":"hi"}},
          "state": {"key":"promptsSinceReflection","value":3,"at":"2026-11-19T09:00:00.000Z","cause":"e-1a2b-c3d4","version":1},
          "relation": {"from":"ship it","type":"follows","to":"run the tests","weight":2,"evidence":["e-1","e-2"]}
        }
        """

    Scenario: Valid records may include extra fields
      Then these extensions are accepted:
        | record   | extra fields               |
        | event    | {"mood":"calm"}            |
        | state    | {}                         |
        | relation | {"extra":{"colour":"red"}} |

    Scenario: Invalid records identify the broken field
      Then these invalid records are explained:
        | record   | change                           | error     |
        | event    | {"actor":{"role":"robot"}}       | actor.role |
        | event    | {"remove":["id","type","actor","data"]} | missing id |
        | state    | {"key":"../escape"}              | key        |
        | state    | {"version":0}                    | version    |
        | relation | {"weight":"NaN"}                 | weight     |
        | relation | {"evidence":"e-1"}               | evidence   |
