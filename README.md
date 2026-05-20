# Intentional Code

**About**

This project contains everything you needed to run the app locally.


**Prerequisites:** 

1. Clone the repository using the project's Git URL 
2. Navigate to the project directory
3. Install dependencies: `npm install`
4. Run the app locally: `npm run dev`


---


1. SSO is enabled via helm.
2. Production support I think we never brought in to scope, like you said it was "do the pilot and bounce."
3. Related: Something we have discussed but said it was a no-go was moving away from on-prem to cloud. This is a massive lift, not hard, but will take time. And then FG becomes a consumer (or whoever else). They'll need to come up with their own interface to our API: /train-model, /calculate-hc, /get-result, etc. The control plane is then centralised. Auth can be via API keys, certificates, or whatever. This would make the support model very easy, you'd be able to do clickops. If we wanted this option we'd need to discuss.
4. Re: Consulting. I think if anything from VM is used or adapted  we need to discuss. If its a new venture and everything is original then I have no issues with you/both doing this. I'd also be open to doing contract after hours work for any infra/dev/technical needs, I don't necessairly need to be part of it.



Authentication is trivial, they can easily have SSO enabled, its just a config item in the helm.

Product support has always been unclear, its never been apparent to me whether its us or FG.

In regards to that, I have since still pondered the idea of just putting our product behind our own cloud API and saying "hey, if you want to use this, you can call our API", we stop supporting on-prem, dust our hands of this. It might cause a stink. but so what, nothing to lose. It would be a big lift. But does open other opportunities. And it makes operational support MUCH easier.

Regarding consulting, I have no issue with you doing this, but I think we need to be careful about using any of the IP we have developed for this project. If its a new venture and you are doing it on your own time, new code, new ideas, etc, then I have no issues with it. If you are using any of the IP we have developed, then I think we need to discuss how we manage that. If you need technical/dev/infra support I can be open to contracting for that, I don't necessarily need to be part of the consulting venture, but I can provide support if needed. If there is a need for a full-time dev we can discuss that as well.