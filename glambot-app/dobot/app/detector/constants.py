CATEGORY_TO_ID = {str(i): i for i in range(1, 11)}

GESTURE_ID_TO_NAME = {
    1: "Index",
    2: "Index + Middle",
    3: "Index + Middle + Ring",
    4: "Index + Middle + Ring + Pinky",
    5: "All Fingers",
    6: "Thumb",
    7: "Thumb + Index",
    8: "Thumb + Index + Middle",
    9: "Thumb + Index + Middle + Ring",
    10: "Fist",
}

GESTURE_COLORS = {
    1:  (0, 165, 255),
    2:  (0, 255, 255),
    3:  (0, 255,   0),
    4:  (255, 165,  0),
    5:  (255,   0, 255),
    6:  (0, 100, 255),
    7:  (100, 255, 255),
    8:  (100, 255, 100),
    9:  (255, 200, 100),
    10: (80,  80, 255),
}

HAND_CONNECTIONS = [
    (0, 1),  (1, 2),  (2, 3),  (3, 4),
    (0, 5),  (5, 6),  (6, 7),  (7, 8),
    (0, 9),  (9, 10), (10, 11), (11, 12),
    (0, 13), (13, 14), (14, 15), (15, 16),
    (0, 17), (17, 18), (18, 19), (19, 20),
    (5, 9),  (9, 13),  (13, 17),
]
