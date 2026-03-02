import { AlertEvent, AlertTopic } from "../types";
import { requestJsonWithFailover } from "./api";

type Severity = "info" | "warning" | "critical";

export const alertService = {
  listTopics: async (): Promise<AlertTopic[]> => {
    const response = await requestJsonWithFailover<{ topics?: AlertTopic[] }>("/alerts/topics", { method: "GET" });
    return Array.isArray(response.topics) ? response.topics : [];
  },

  createTopic: async (payload: {
    label: string;
    query: string;
    interval_minutes?: number;
    severity_floor?: Severity;
  }): Promise<AlertTopic> => {
    const response = await requestJsonWithFailover<{ topic: AlertTopic }>("/alerts/topics", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return response.topic;
  },

  updateTopic: async (
    topicId: string,
    payload: Partial<{
      label: string;
      query: string;
      enabled: boolean;
      interval_minutes: number;
      severity_floor: Severity;
    }>
  ): Promise<AlertTopic> => {
    const response = await requestJsonWithFailover<{ topic: AlertTopic }>(`/alerts/topics/${topicId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return response.topic;
  },

  deleteTopic: async (topicId: string): Promise<void> => {
    await requestJsonWithFailover(`/alerts/topics/${topicId}`, { method: "DELETE" });
  },

  runTopicNow: async (topicId: string): Promise<AlertEvent | null> => {
    const response = await requestJsonWithFailover<{ event?: AlertEvent | null }>(`/alerts/topics/${topicId}/run`, {
      method: "POST",
    });
    return response.event ?? null;
  },

  listEvents: async (limit = 40): Promise<AlertEvent[]> => {
    const response = await requestJsonWithFailover<{ events?: AlertEvent[] }>(`/alerts/events?limit=${limit}`, {
      method: "GET",
    });
    return Array.isArray(response.events) ? response.events : [];
  },

  acknowledgeEvent: async (eventId: string): Promise<void> => {
    await requestJsonWithFailover(`/alerts/events/${eventId}/ack`, { method: "POST" });
  },
};
