export class CliArgumentError extends Error {
  name = "CliArgumentError";
}

function requiredValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new CliArgumentError(`${flag} needs a value`);
  }
  return value;
}

export function parseEvalArgs(argv) {
  const options = {
    names: [],
    keep: false,
    model: null,
    maxMinutes: 25,
    gradeDir: null,
  };
  const seen = new Set();
  let optionsStarted = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      if (optionsStarted) throw new CliArgumentError("scenario names must precede options");
      options.names.push(argument);
      continue;
    }

    optionsStarted = true;
    if (seen.has(argument)) throw new CliArgumentError(`duplicate option ${argument}`);
    seen.add(argument);

    switch (argument) {
      case "--keep":
        options.keep = true;
        break;
      case "--model":
        options.model = requiredValue(argv, index, argument);
        index += 1;
        break;
      case "--max-time": {
        const value = requiredValue(argv, index, argument);
        const minutes = Number(value);
        if (!Number.isFinite(minutes) || minutes <= 0) {
          throw new CliArgumentError("--max-time needs a positive number of minutes");
        }
        options.maxMinutes = minutes;
        index += 1;
        break;
      }
      case "--grade": {
        const candidate = argv[index + 1];
        if (candidate?.startsWith("--")) {
          throw new CliArgumentError("--grade must be the final option");
        }
        options.gradeDir = candidate ?? "";
        if (candidate !== undefined) index += 1;
        if (index !== argv.length - 1) {
          throw new CliArgumentError("--grade must be the final option");
        }
        break;
      }
      default:
        throw new CliArgumentError(`unknown option ${argument}`);
    }
  }

  return options;
}
