import { makeAssistantToolUI } from "@assistant-ui/react";
import { CloudRain, Sun, Cloud, Thermometer } from "lucide-react";

type WeatherArgs = { location: string };
type WeatherResult = { location: string; temperature: number; condition: string };

export const WeatherToolUI = makeAssistantToolUI<WeatherArgs, WeatherResult>({
  toolName: "get_weather",
  render: ({ args, result }) => {
    if (!result) {
      return (
        <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground bg-muted/30 rounded-lg border border-border/50 animate-pulse">
          <Thermometer className="w-4 h-4 animate-bounce" />
          Checking weather in {args.location}...
        </div>
      );
    }

    const { temperature, condition, location } = result;
    
    let Icon = Cloud;
    if (condition.toLowerCase().includes("rain")) Icon = CloudRain;
    if (condition.toLowerCase().includes("sun") || condition.toLowerCase().includes("clear")) Icon = Sun;

    return (
      <div className="flex items-center justify-between p-4 bg-background border rounded-xl shadow-sm my-2 max-w-sm">
        <div className="flex flex-col">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Weather • {location}
          </span>
          <div className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-blue-500" />
            <span className="text-lg font-bold">{temperature}°</span>
            <span className="text-sm font-medium capitalize text-foreground/80">{condition}</span>
          </div>
        </div>
      </div>
    );
  },
});
