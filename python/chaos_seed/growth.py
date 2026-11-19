"""Growth stages and variation checks."""


STAGES = ((26, "re-seed"), (16, "governed"), (10, "routine"), (4, "noticed"), (2, "dance"))
NOTICED_WEIGHT = next(threshold for threshold, stage in STAGES if stage == "noticed")


def ladder_stage(weight):
    return next((stage for threshold, stage in STAGES if weight >= threshold), "none")


def is_variation_check(count):
    if type(count) is not int:
        return False
    current, following = 2, 6
    while current < count:
        current, following = following, current + following
    return current == count
