<?php

namespace App\Support;

use App\Enums\LlmEngine;
use App\Models\AppSetting;
use Illuminate\Support\Facades\Cache;

/**
 * The names the app shows for the assistant engines. The admin panel renames
 * them; unlock hands them to the app, which also sends the Mark-L name to
 * zypherLL as `assistant_name` so the assistant introduces itself by it.
 */
final class EngineNames
{
    public const CACHE_KEY = 'app_settings.engine_names';

    public static function key(LlmEngine $engine): string
    {
        return 'engine_name.'.$engine->value;
    }

    /**
     * @return array<string, string> engine value => name
     */
    public static function all(): array
    {
        return Cache::rememberForever(self::CACHE_KEY, function (): array {
            $stored = AppSetting::query()
                ->whereIn('key', array_map(self::key(...), LlmEngine::cases()))
                ->pluck('value', 'key');

            $names = [];

            foreach (LlmEngine::cases() as $engine) {
                $names[$engine->value] = filled($stored[self::key($engine)] ?? null)
                    ? $stored[self::key($engine)]
                    : $engine->defaultName();
            }

            return $names;
        });
    }

    public static function of(LlmEngine $engine): string
    {
        return self::all()[$engine->value];
    }

    /**
     * The engines in a fixed order, as the app's engine picker lists them.
     *
     * @return list<array{id: string, name: string}>
     */
    public static function list(): array
    {
        return array_map(
            fn (LlmEngine $engine) => ['id' => $engine->value, 'name' => self::of($engine)],
            LlmEngine::cases(),
        );
    }

    public static function rename(LlmEngine $engine, string $name): void
    {
        AppSetting::updateOrCreate(['key' => self::key($engine)], ['value' => trim($name)]);

        Cache::forget(self::CACHE_KEY);
    }
}
