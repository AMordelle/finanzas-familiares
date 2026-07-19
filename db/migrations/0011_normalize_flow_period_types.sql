-- A flow always has a usable cadence, including manual-target flows.
UPDATE flow_funds SET period_type = 'weekly' WHERE code IN ('weekly', 'miscellaneous') AND (period_type IS NULL OR period_type = '' OR period_type NOT IN ('weekly', 'monthly', 'bimonthly', 'semiannual', 'annual'));
UPDATE flow_funds SET period_type = 'monthly' WHERE code IN ('monthly', 'wealth') AND (period_type IS NULL OR period_type = '' OR period_type NOT IN ('weekly', 'monthly', 'bimonthly', 'semiannual', 'annual'));
UPDATE flow_funds SET period_type = 'bimonthly' WHERE code = 'bimonthly' AND (period_type IS NULL OR period_type = '' OR period_type NOT IN ('weekly', 'monthly', 'bimonthly', 'semiannual', 'annual'));
UPDATE flow_funds SET period_type = 'semiannual' WHERE code = 'semiannual' AND (period_type IS NULL OR period_type = '' OR period_type NOT IN ('weekly', 'monthly', 'bimonthly', 'semiannual', 'annual'));
UPDATE flow_funds SET period_type = 'annual' WHERE code = 'annual' AND (period_type IS NULL OR period_type = '' OR period_type NOT IN ('weekly', 'monthly', 'bimonthly', 'semiannual', 'annual'));

-- Custom flows with invalid legacy data are intentionally left for the user to select a cadence in Configuración.
