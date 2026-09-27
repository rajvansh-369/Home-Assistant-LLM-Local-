<?php

namespace App\Filament\Resources\Households\RelationManagers;

use App\Enums\LocationEvent;
use App\Models\Location;
use App\Models\User;
use App\Services\AdminAudit;
use App\Support\AdminDay;
use Carbon\CarbonImmutable;
use Filament\Actions\Action;
use Filament\Forms\Components\DatePicker;
use Filament\Infolists\Components\IconEntry;
use Filament\Infolists\Components\TextEntry;
use Filament\Resources\RelationManagers\RelationManager;
use Filament\Schemas\Components\EmbeddedTable;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Components\View;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Livewire\Attributes\Locked;

/**
 * Locations tab (§6): the tracking settings, then one day's trail on a map
 * and in a table. Nothing with coordinates is in the page until Show
 * locations writes locations.viewed for that day.
 */
class LocationsRelationManager extends RelationManager
{
    protected static string $relationship = 'locations';

    protected static ?string $title = 'Locations';

    /**
     * The day being shown, in ASTER_ADMIN_TIMEZONE. Only Show locations sets
     * it, so the browser can't skip the audit entry.
     */
    #[Locked]
    public ?string $day = null;

    public function content(Schema $schema): Schema
    {
        return $schema
            ->components([
                $this->trackingSection(),
                View::make('filament.households.locations-map')->visible(fn (): bool => $this->day !== null),
                EmbeddedTable::make(),
            ]);
    }

    public function table(Table $table): Table
    {
        $tz = AdminDay::timezone();

        return $table
            ->heading(fn (): string => $this->day === null
                ? 'Locations'
                : 'Locations on '.CarbonImmutable::parse($this->day)->format('D j M Y'))
            ->modifyQueryUsing(fn (Builder $query): Builder => $this->day === null
                ? $query->whereKey([])
                : $this->onDay($query)->with(['place', 'device']))
            ->columns([
                TextColumn::make('recorded_at')->label('Time')->dateTime('H:i:s', $tz),
                TextColumn::make('event')
                    ->badge()
                    ->color(fn (LocationEvent $state): string => match ($state) {
                        LocationEvent::Arrived => 'success',
                        LocationEvent::Left => 'danger',
                        LocationEvent::Periodic => 'gray',
                    }),
                TextColumn::make('lat')->label('Latitude'),
                TextColumn::make('lng')->label('Longitude'),
                TextColumn::make('accuracy_m')->label('Accuracy')->suffix(' m')->placeholder('—'),
                TextColumn::make('place.name')->label('Place')->placeholder('—'),
                TextColumn::make('device.name')->label('Device'),
            ])
            ->defaultSort('recorded_at')
            ->paginated([50, 100, 'all'])
            ->defaultPaginationPageOption(100)
            ->emptyStateHeading(fn (): string => $this->day === null ? 'Locations are hidden' : 'No locations that day')
            ->emptyStateDescription(fn (): ?string => $this->day === null
                ? 'Pick a day with Show locations. Each view is written to the audit log.'
                : null)
            ->headerActions([
                Action::make('showLocations')
                    ->label('Show locations')
                    ->icon(Heroicon::OutlinedMap)
                    ->modalHeading('Show a day\'s locations')
                    ->modalDescription('Viewing a household\'s location trail is written to the audit log, with the day you pick.')
                    ->schema([
                        DatePicker::make('day')
                            ->label("Day ({$tz})")
                            ->default(AdminDay::today())
                            ->maxDate(AdminDay::today())
                            ->required(),
                    ])
                    ->modalSubmitActionLabel('Show')
                    ->action(function (array $data): void {
                        $day = CarbonImmutable::parse((string) $data['day'])->toDateString();

                        AdminAudit::record(AdminAudit::LOCATIONS_VIEWED, $this->household(), meta: ['date' => $day]);

                        $this->day = $day;
                        $this->resetPage();
                    }),
                Action::make('hideLocations')
                    ->label('Hide')
                    ->color('gray')
                    ->visible(fn (): bool => $this->day !== null)
                    ->action(function (): void {
                        $this->day = null;
                    }),
            ]);
    }

    /**
     * The shown day's points for the map, oldest first.
     *
     * @return list<array{lat: float, lng: float, event: string, label: string}>
     */
    public function mapPoints(): array
    {
        if ($this->day === null) {
            return [];
        }

        $tz = AdminDay::timezone();

        return $this->onDay($this->household()->locations()->getQuery())
            ->orderBy('recorded_at')
            ->get(['lat', 'lng', 'event', 'recorded_at'])
            ->map(fn (Location $point): array => [
                'lat' => (float) $point->lat,
                'lng' => (float) $point->lng,
                'event' => $point->event->value,
                'label' => $point->recorded_at->setTimezone($tz)->format('H:i').' · '.$point->event->value,
            ])
            ->values()
            ->all();
    }

    /**
     * @return array{lat: float, lng: float, radius: int}|null
     */
    public function mapHome(): ?array
    {
        $home = $this->household()->home;

        return $home === null ? null : ['lat' => (float) $home->lat, 'lng' => (float) $home->lng, 'radius' => $home->radius_m];
    }

    private function trackingSection(): Section
    {
        $settings = fn () => $this->household()->locationSettings;

        return Section::make('Tracking')
            ->columns(5)
            ->schema([
                IconEntry::make('enabled')->label('On')->boolean()->state(fn (): bool => (bool) $settings()?->enabled),
                TextEntry::make('interval_minutes')->label('Every')->suffix(' min')->state(fn (): ?int => $settings()?->interval_minutes),
                TextEntry::make('retention_days')->label('Kept for')->suffix(' days')->state(fn (): ?int => $settings()?->retention_days),
                IconEntry::make('share_area')->label('Shares area')->boolean()->state(fn (): bool => (bool) $settings()?->share_area),
                TextEntry::make('paused_until')
                    ->label('Paused until')
                    ->state(fn (): mixed => $settings()?->paused_until)
                    ->dateTime('d M Y, H:i', AdminDay::timezone())
                    ->placeholder('Not paused'),
            ]);
    }

    /**
     * @template TQuery of Builder<Location>
     *
     * @param  TQuery  $query
     * @return TQuery
     */
    private function onDay(Builder $query): Builder
    {
        return $query
            ->where('recorded_at', '>=', AdminDay::start((string) $this->day))
            ->where('recorded_at', '<', AdminDay::end((string) $this->day));
    }

    private function household(): User
    {
        /** @var User */
        return $this->getOwnerRecord();
    }
}
