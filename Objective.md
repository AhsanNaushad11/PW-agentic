### PW Agentic

The objective of application development is to provide such a software solution, who's purpose is to perform agentic based game testing, if you understand this. I have a base code already written in Next.js and is deployed on GitHub. The game types are such as online slot games (with proper game rules) and other games like plinko, crash games, card games. At first we will only target testing the slot games and the agent will use and write playwright scripts accordingly. The agent will load the game with provided credentials and lobby access, observe the bet screen after the game successfully loads, check all the buttons and game functions. Memorize the game rules and capture all the screenshots as evidence of the game rules. The system will then check the game rounds with game history with respect to game rules if all are correct. In the process, system will capture the screenshots as evidence of every winnings and losses, on the bet screen, in the game history and of the game rules involved in the game rounds. Approximate of 100 game rounds will be captured and checked this way. This will be functional testing.



Now here comes the crazy part. At the first game, lets say the system will write playwright script and check first if that script successfully works on that game while keep changing where needed or if any errors. Once we are done with one game, save that script for future other games. When I provide another game, modify the same script and save the generic stuff again. So every next time, there will be less code writing.



All the above is for functional testing.

User requirements to consider,

* This will be browser automated agentic testing via playwright script.
* We will target using the google AI studio. (For this I have google AI pro subscription). For all very basic tasks we will use gemni flash (such as taking user inputs and any pity tasks).
* The application much give user the panel to interact with the agent and there user can provide additional instructions to be written in playwright script. (This will be the side bar at the right vertical of the screen)
* Provide another panel in that application, where the evidences are visible during testing, after all the tests are finished user shall be able to download all the evidence. (This will the bottom horizontal of the screen)
* The main panel will have all necessary user controls/input controls, like where user will provide access details. Another textbox where he can add additional test cases that model will consider after its functional testing.

