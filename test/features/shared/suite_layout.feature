Feature: A shared layout for test and production modules

  Scenario: The runner provides each agreed step module
    Then this runner has exactly these step modules:
      | module           |
      | domain           |
      | hooks            |
      | interoperability |
      | suite_layout     |
      | workspace        |

  Scenario: The runner provides each agreed production module and entry point
    Then this runner has exactly these production modules:
      | module    |
      | contract  |
      | formats   |
      | growth    |
      | mutation  |
      | spiral    |
      | workspace |
    And this runner uses these production entry points:
      | entry | path              |
      | cli   | bin/spiral        |
      | hook  | hooks/spiral-hook |
