@php
    /** @var \App\Filament\Resources\Households\RelationManagers\LocationsRelationManager $livewire */
    $livewire = $getLivewire();
@endphp

<div>
    <x-leaflet-map
        wire:key="locations-map-{{ $livewire->day }}"
        :points="$livewire->mapPoints()"
        :home="$livewire->mapHome()"
        :path="true"
        height="26rem"
    />

    <p style="margin-top: 0.5rem; font-size: 0.75rem; color: var(--gray-500)">
        Green: arrived. Red: left. Blue: periodic points, joined in time order. The circle is the home area.
    </p>
</div>
