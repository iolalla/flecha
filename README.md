### Flecha
#

Flecha: The Objective is to generate the Vector of every stock, using the last 30 days calculate the Vector with direction, Beta and possible return.

---

To calculate the direction and intensity (magnitude) of the movement at the start of the current session using the previous 30 days, we need to structure the data historically. Here is the mathematical explanation of how this vector is constructed.

### 1. The Direction of the Vector

The direction tells us whether the trend is bullish or bearish and at what incline. It is calculated using simple linear regression on the closing prices (or average prices) of the last 30 days.

We represent time as $t = [1, 2, \dots, 30]$ and prices as $P = [P_1, P_2, \dots, P_{30}]$. We solve for the slope ($\beta$) of the line of best fit through those points:

$$\beta = \frac{\sum_{t=1}^{30} (t - \bar{t})(P_t - \bar{P})}{\sum_{t=1}^{30} (t - \bar{t})^2}$$

* $\beta > 0$: Bullish direction.
* $\beta < 0$: Bearish direction.

To express the direction as an angle in degrees ($\theta$) relative to the horizontal, we take the arctangent of the slope (ensuring prices are normalized so that the scales of time and money are comparable):

$$\theta = \arctan(\beta)$$

---

### 2. The Intensity (Magnitude) of the Vector

Intensity depends not only on how much the price changed, but also on the strength and speed of the movement. To measure it accurately using the previous 30 days, we combine three key variables:

* **Return Magnitude ($R$):** The net percentage change over the 30 days.

$$R = \frac{P_{30} - P_1}{P_1}$$


* **Volatility ($SD$):** The standard deviation of daily returns. If the path was direct (low volatility), the vector is more "solid" than if there were wild swings.
* **Relative Volume ($V$):** The recent transaction volume compared to the 30-day average. A movement on high volume carries greater intensity (strength).

Combining these, the intensity ($\Vert\vec{V}\Vert$) can be defined as the net return adjusted by its confidence level (volume/volatility):

$$\Vert\vec{V}\Vert = \vert{}R\vert{} \times \left( \frac{V_{\text{current}}}{\bar{V}_{30}} \right) \times \frac{1}{SD}$$

---

### The Opening Vector ($\vec{V}_{\text{opening}}$)

At the start of the day's session (at minute 1), the final vector combines the inertia of the previous 30 days with the opening gap (the difference between yesterday's close and today's open).

========================================
STOCK VECTOR: AAPL
========================================
1. DIRECTION OF MOVEMENT:
- Slope (Beta): -0.005972
- Vector Angle: -10.16°
- 30-Day Return: -1.93%
2. INTENSITY AND CONFIDENCE:
- Volatility: 1.97%
- Volume Ratio: 1.22x (vs 30d)
- VECTOR MAGNITUDE: 1.19
3. TODAY'S OPENING:
- Opening Gap: -1.29%
Calculated with the latest 30 trading days
========================================
