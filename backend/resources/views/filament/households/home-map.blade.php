@php
    $home = $getRecord()->home;
@endphp

<x-leaflet-map
    :home="['lat' => (float) $home->lat, 'lng' => (float) $home->lng, 'radius' => $home->radius_m]"
    height="14rem"
/>
