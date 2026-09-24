<?php

it('answers the health check', function () {
    $this->get('/up')->assertOk();
});

it('has no welcome page', function () {
    $this->get('/')->assertNotFound();
});

it('has no sample user route', function () {
    $this->getJson('/api/user')->assertNotFound();
});
