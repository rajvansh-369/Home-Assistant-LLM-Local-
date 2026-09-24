<?php

use Tests\TestCase;

/*
|--------------------------------------------------------------------------
| Test Case
|--------------------------------------------------------------------------
|
| Feature tests run on Laravel's TestCase with an in-memory SQLite database
| (see phpunit.xml). Phase 1 adds RefreshDatabase once there are models.
|
*/

pest()->extend(TestCase::class)->in('Feature');
