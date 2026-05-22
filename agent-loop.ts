import { main } from "./src/index";

main()
	.then((result) => {
		if (result.isErr()) {
			console.error("Agent Loop failed:", result.error.message);
			process.exit(1);
		}
		console.log("Agent Loop completed successfully.");
		console.log(`Iterations: ${result.value.iterations}`);
		console.log(`PR created: ${result.value.prCreated}`);
	})
	.catch((error) => {
		console.error("Unexpected error:", error);
		process.exit(1);
	});
