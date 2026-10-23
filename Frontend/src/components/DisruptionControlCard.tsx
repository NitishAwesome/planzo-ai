import { useState, useId } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  CloudRain,
  ExternalLink,
  Info,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Thermometer,
  Wind,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Pill } from "@/components/bits";
import type { GeoLocation, PlanEvent, Risk, Venue } from "@/data/types";
import { evaluateLiveWeatherRisk, fmtDay, fmtTime, nowLocal, toMs } from "@/lib/planning";
import { setEventLocationAction, setEventWeatherRiskAction } from "@/services/demo-store";
import {
  fetchHourlyForecast,
  searchLocations,
  WEATHER_ATTRIBUTION,
  WEATHER_ATTRIBUTION_URL,
} from "@/services/weather-api";
import { cn } from "@/lib/utils";

interface DisruptionControlCardProps {
  event: PlanEvent;
  venue: Venue | undefined;
  onFocusStudio?: () => void;
}

export function DisruptionControlCard({ event, venue, onFocusStudio }: DisruptionControlCardProps) {
  const [activeTab, setActiveTab] = useState<"simulated" | "forecast">(
    event.weatherMode ??
      (event.risk?.source === "Forecast from Open-Meteo" ? "forecast" : "simulated"),
  );

  // Simulated scenario state
  const [simProb, setSimProb] = useState<number>(event.risk?.probability ?? 85);
  const [simWindow, setSimWindow] = useState<string>(
    event.risk?.window ?? `${fmtTime(event.start)} – ${fmtTime(event.end)}`,
  );
  const [simDetail, setSimDetail] = useState<string>(
    event.risk?.detail ??
      "Sustained heavy rain expected during the event window. Outdoor seating and equipment would be exposed.",
  );

  // Live forecast search & fetch state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GeoLocation[]>([]);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [isChangingLocation, setIsChangingLocation] = useState(!event.location);
  const [isFetchingForecast, setIsFetchingForecast] = useState(false);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [lastAssessment, setLastAssessment] = useState<{
    maxProb: number;
    rainMm: number;
    maxWind: number;
    fetchedAt: string;
    canForecast: boolean;
    reason?: string;
  } | null>(
    event.risk?.forecastMetadata
      ? {
          maxProb: event.risk.forecastMetadata.precipitationProbabilityMax,
          rainMm: event.risk.forecastMetadata.rainSumMm,
          maxWind: event.risk.forecastMetadata.windSpeedMaxKmh ?? 0,
          fetchedAt: event.risk.forecastMetadata.fetchedAt,
          canForecast: true,
        }
      : null,
  );

  const isOutdoor = venue ? !venue.indoor : true;
  const hasActiveRisk = event.risk && event.risk.status === "active";

  // Check event date horizon vs today
  const eventStartMs = toMs(event.start);
  const nowMs = Date.now();
  const diffDays = (eventStartMs - nowMs) / (1000 * 60 * 60 * 24);
  const isPastEvent = diffDays < -1;
  const isTooFarFuture = diffDays > 16;

  // Location search handler
  const handleLocationSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearchingLocation(true);
    try {
      const results = await searchLocations(query);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearchingLocation(false);
    }
  };

  const handleSelectLocation = (loc: GeoLocation) => {
    setEventLocationAction(event.id, loc);
    setIsChangingLocation(false);
    setSearchQuery("");
    setSearchResults([]);
    toast.success(`Location set to ${loc.name}${loc.country ? `, ${loc.country}` : ""}`);
  };

  // Forecast fetch handler
  const handleFetchForecast = async (forceFresh = false) => {
    if (!event.location) {
      toast.error("Please select a geographic location for this event first.");
      setIsChangingLocation(true);
      return;
    }

    if (isPastEvent) {
      toast.error("Event is in the past. Live forecast cannot be retrieved.");
      return;
    }

    if (isTooFarFuture) {
      toast.error("Event is beyond the 16-day forecast horizon. Live forecast not yet available.");
      return;
    }

    setIsFetchingForecast(true);
    setForecastError(null);

    try {
      const res = await fetchHourlyForecast(
        event.location.latitude,
        event.location.longitude,
        event.location.timezone ?? "auto",
        forceFresh,
      );

      const assessed = evaluateLiveWeatherRisk(res.hourly, event, venue, nowLocal());

      if (!assessed.canForecast) {
        setForecastError(
          assessed.reason ?? "Forecast points could not be matched to event window.",
        );
        setLastAssessment(null);
        return;
      }

      setLastAssessment({
        maxProb: assessed.maxPrecipitationProbability,
        rainMm: assessed.totalRainMm,
        maxWind: assessed.maxWindSpeedKmh,
        fetchedAt: nowLocal(),
        canForecast: true,
      });

      if (assessed.risk) {
        setEventWeatherRiskAction(event.id, assessed.risk, "forecast");
        toast.warning(
          `Rain risk detected (${assessed.maxPrecipitationProbability}% chance, ${assessed.totalRainMm} mm). Outdoor contingency needed.`,
        );
      } else {
        // Rain risk is low or absent
        if (event.risk?.source === "Forecast from Open-Meteo") {
          setEventWeatherRiskAction(event.id, null, "forecast");
        }
        toast.success(
          isOutdoor
            ? `Weather forecast clear: max ${assessed.maxPrecipitationProbability}% rain chance (${assessed.totalRainMm} mm).`
            : "Event is in an indoor venue. Weather disruption not triggered.",
        );
      }
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? "Failed to retrieve forecast.";
      setForecastError(msg);
      toast.error(msg);
    } finally {
      setIsFetchingForecast(false);
    }
  };

  // Activate simulated risk
  const handleActivateSimulated = (e: React.FormEvent) => {
    e.preventDefault();
    const newRisk: Risk = {
      kind: "heavy-rain",
      title: "Heavy rain during event window",
      detail: simDetail.trim(),
      source: "Simulated scenario",
      probability: Number(simProb) || 85,
      window: simWindow.trim(),
      status: "active",
    };
    setEventWeatherRiskAction(event.id, newRisk, "simulated");
    toast.success("Simulated heavy-rain disruption activated.");
  };

  // Dismiss risk
  const handleDismissRisk = () => {
    setEventWeatherRiskAction(event.id, null);
    toast.success("Disruption dismissed. Event is marked clear of active risks.");
  };

  return (
    <section
      aria-label="Disruption & Weather Intelligence"
      className="surface overflow-hidden rounded-xl border bg-card p-5 shadow-xs"
    >
      {/* Header and Source Badges */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <CloudRain className="h-5 w-5 text-primary" />
            <h2 className="text-base font-extrabold tracking-tight">
              Disruption & Weather Intelligence
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Manage simulated testing scenarios or evaluate live meteorological forecasts from
            Open-Meteo.
          </p>
        </div>

        {/* Current Active Risk Source Pill */}
        {event.risk ? (
          event.risk.source === "Forecast from Open-Meteo" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
              <span className="size-1.5 rounded-full bg-primary" />
              Forecast from Open-Meteo
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold text-muted-foreground">
              <span className="size-1.5 rounded-full bg-muted-foreground" />
              Simulated scenario
            </span>
          )
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-bold text-success">
            <CheckCircle2 className="size-3.5" />
            No active risk
          </span>
        )}
      </div>

      {/* Mode Tabs */}
      <div className="mt-4 flex rounded-lg bg-muted p-1 text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveTab("simulated")}
          className={cn(
            "flex-1 rounded-md py-1.5 transition text-center",
            activeTab === "simulated"
              ? "bg-background text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Mode A — Simulated Scenario
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("forecast")}
          className={cn(
            "flex-1 rounded-md py-1.5 transition text-center",
            activeTab === "forecast"
              ? "bg-background text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Mode B — Live Forecast (Open-Meteo)
        </button>
      </div>

      {/* Mode A: Simulated Scenario */}
      {activeTab === "simulated" && (
        <div className="mt-4 space-y-4">
          <div className="rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
            <strong className="text-foreground">Simulated Mode: </strong>
            Designed for predictable product testing and offline demonstrations. Trigger a heavy
            rain disruption with custom probability and time window.
          </div>

          {hasActiveRisk && event.risk?.source === "Simulated scenario" ? (
            <div className="rounded-lg border border-warning/30 bg-warning-soft/40 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-foreground">{event.risk.title}</span>
                    <Pill tone="warning">{event.risk.probability}% Rain Risk</Pill>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Window: <strong>{event.risk.window}</strong>
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">{event.risk.detail}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDismissRisk}
                  className="h-8 text-xs font-semibold"
                >
                  <XCircle className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                  Dismiss Disruption
                </Button>
                {onFocusStudio && (
                  <Button
                    size="sm"
                    onClick={onFocusStudio}
                    className="h-8 text-xs font-semibold shadow-xs"
                  >
                    <span>Request Recovery Plan</span>
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={handleActivateSimulated} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="sim-prob" className="text-xs font-semibold">
                    Simulated Probability (%)
                  </Label>
                  <Input
                    id="sim-prob"
                    type="number"
                    min={1}
                    max={100}
                    value={simProb}
                    onChange={(e) => setSimProb(Number(e.target.value))}
                    className="text-xs sm:text-sm"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sim-window" className="text-xs font-semibold">
                    Time Window
                  </Label>
                  <Input
                    id="sim-window"
                    value={simWindow}
                    onChange={(e) => setSimWindow(e.target.value)}
                    placeholder="e.g. 14:00 – 16:00"
                    className="text-xs sm:text-sm"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="sim-detail" className="text-xs font-semibold">
                  Scenario Description
                </Label>
                <Textarea
                  id="sim-detail"
                  value={simDetail}
                  onChange={(e) => setSimDetail(e.target.value)}
                  rows={2}
                  className="text-xs sm:text-sm"
                  required
                />
              </div>

              <Button type="submit" size="sm" className="text-xs font-semibold">
                <CloudRain className="mr-1.5 h-3.5 w-3.5" />
                Activate Simulated Disruption
              </Button>
            </form>
          )}
        </div>
      )}

      {/* Mode B: Live Forecast (Open-Meteo) */}
      {activeTab === "forecast" && (
        <div className="mt-4 space-y-4">
          <div className="rounded-lg bg-primary/5 p-3 text-xs text-muted-foreground border border-primary/20">
            <strong className="text-foreground">Open-Meteo Forecast: </strong>
            Evaluates predictive meteorological forecasts up to 16 days ahead. Hourly precipitation
            and wind data are filtered strictly to the event window.
          </div>

          {/* Location Selection & Geocoding */}
          <div className="rounded-lg border bg-card p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-primary" /> Event Geographic Location
              </span>
              {event.location && !isChangingLocation && (
                <button
                  type="button"
                  onClick={() => setIsChangingLocation(true)}
                  className="text-[11px] font-semibold text-primary underline hover:text-primary/80"
                >
                  Change Location
                </button>
              )}
            </div>

            {event.location && !isChangingLocation ? (
              <div className="text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">
                  {event.location.name}
                  {event.location.admin1 ? `, ${event.location.admin1}` : ""}
                  {event.location.country ? `, ${event.location.country}` : ""}
                </p>
                <p className="text-[11px] font-mono mt-0.5">
                  Lat: {event.location.latitude.toFixed(4)}°, Lon:{" "}
                  {event.location.longitude.toFixed(4)}° · Timezone:{" "}
                  {event.location.timezone ?? "Auto"}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search city or location (e.g., Mumbai, London, Seattle)..."
                    value={searchQuery}
                    onChange={(e) => handleLocationSearch(e.target.value)}
                    className="pl-8 text-xs"
                  />
                  {isSearchingLocation && (
                    <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>

                {searchResults.length > 0 && (
                  <ul className="max-h-40 overflow-y-auto rounded-md border bg-popover p-1 text-xs shadow-md space-y-1">
                    {searchResults.map((loc, idx) => (
                      <li
                        key={`${loc.name}-${loc.latitude}-${idx}`}
                        onClick={() => handleSelectLocation(loc)}
                        className="cursor-pointer rounded p-2 hover:bg-accent flex items-center justify-between"
                      >
                        <div>
                          <strong className="text-foreground">{loc.name}</strong>
                          <span className="text-muted-foreground ml-1">
                            {loc.admin1 ? `${loc.admin1}, ` : ""}
                            {loc.country ?? ""}
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {loc.latitude.toFixed(2)}°, {loc.longitude.toFixed(2)}°
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Date & Horizon Validation Notices */}
          {isPastEvent && (
            <div className="flex items-center gap-2 rounded-lg border border-muted bg-muted/40 p-3 text-xs text-muted-foreground">
              <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span>
                This event is in the past. Live forecast data is only available for current and
                future events.
              </span>
            </div>
          )}

          {isTooFarFuture && (
            <div className="flex items-center gap-2 rounded-lg border border-muted bg-muted/40 p-3 text-xs text-muted-foreground">
              <Info className="h-4 w-4 shrink-0 text-primary" />
              <span>
                Event is scheduled beyond the standard 16-day forecast horizon. Live forecast will
                be available closer to the date.
              </span>
            </div>
          )}

          {/* Forecast Refresh and Evaluation Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              size="sm"
              onClick={() => handleFetchForecast(true)}
              disabled={isFetchingForecast || isPastEvent || isTooFarFuture || !event.location}
              className="text-xs font-semibold"
            >
              {isFetchingForecast ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Fetching Open-Meteo...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  Check Live Forecast
                </>
              )}
            </Button>

            {hasActiveRisk && event.risk?.source === "Forecast from Open-Meteo" && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleDismissRisk}
                className="text-xs font-semibold"
              >
                <XCircle className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                Dismiss Forecast Risk
              </Button>
            )}
          </div>

          {forecastError && (
            <div className="rounded-lg border border-destructive/40 bg-destructive-soft p-3 text-xs text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{forecastError}</span>
            </div>
          )}

          {/* Live Evidence Metrics Card */}
          {lastAssessment && (
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-foreground">
                  Event Window Weather Analysis ({fmtTime(event.start)}–{fmtTime(event.end)})
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Checked: {fmtTime(lastAssessment.fetchedAt)}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-md border p-2 bg-muted/20">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                    Max Rain Prob
                  </span>
                  <span className="text-base font-extrabold text-foreground">
                    {lastAssessment.maxProb}%
                  </span>
                </div>

                <div className="rounded-md border p-2 bg-muted/20">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                    Precipitation
                  </span>
                  <span className="text-base font-extrabold text-foreground">
                    {lastAssessment.rainMm} mm
                  </span>
                </div>

                <div className="rounded-md border p-2 bg-muted/20">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                    Wind Speed
                  </span>
                  <span className="text-base font-extrabold text-foreground">
                    {lastAssessment.maxWind} km/h
                  </span>
                </div>
              </div>

              {/* Assessment Outcome Statement */}
              <div className="text-xs text-muted-foreground border-t pt-2">
                {isOutdoor ? (
                  lastAssessment.maxProb >= 50 || lastAssessment.rainMm >= 1.0 ? (
                    <div className="flex items-start gap-2 text-warning-ink font-medium">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>
                        Outdoor venue exposure detected: Rain chance ({lastAssessment.maxProb}%)
                        exceeds threshold (50% or 1.0mm). Contingency relocation is advised.
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 text-success font-medium">
                      <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>
                        Weather within safe margins (max {lastAssessment.maxProb}% rain chance,{" "}
                        {lastAssessment.rainMm} mm). Outdoor event can proceed on schedule.
                      </span>
                    </div>
                  )
                ) : (
                  <div className="flex items-start gap-2 text-muted-foreground">
                    <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                    <span>
                      Indoor setting: Event is held in {venue?.name ?? "an indoor space"}, so rain
                      does not directly disrupt seating or equipment.
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Attribution footer */}
          <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t pt-2">
            <span>{WEATHER_ATTRIBUTION}</span>
            <a
              href={WEATHER_ATTRIBUTION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-primary underline hover:text-primary/80"
            >
              Open-Meteo Documentation
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
